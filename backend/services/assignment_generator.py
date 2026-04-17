"""Centralised assignment generation logic.

Used by both the calendar auto-generation endpoint and the daily reset
background task to avoid duplicating the complex scheduling rules.
"""

import logging
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models import (
    Chore,
    ChoreAssignment,
    ChoreAssignmentRule,
    ChoreExclusion,
    ChoreRotation,
    AssignmentStatus,
    Recurrence,
)
from backend.services.recurrence import should_create_on_day
from backend.services.rotation import (
    get_rotation_kid_for_day,
    should_advance_rotation,
    advance_rotation,
)

logger = logging.getLogger(__name__)


async def auto_generate_week_assignments(
    db: AsyncSession, week_start: date
) -> None:
    """Generate ChoreAssignment records for recurring chores across a week.

    Uses batch-loading to avoid N+1 query bottlenecks.
    """
    week_end = week_start + timedelta(days=6)
    week_dates = [week_start + timedelta(days=i) for i in range(7)]

    # Filter out vacation days from week generation
    from backend.routers.vacation import is_vacation_day
    active_dates = []
    for d in week_dates:
        if not await is_vacation_day(db, d):
            active_dates.append(d)
    week_dates = active_dates

    if not week_dates:
        return

    exclusion_set = await _load_exclusion_set(db, week_start, week_end)
    chores = await _load_active_chores(db)
    chore_ids = [c.id for c in chores]
    
    # Batch load rules and rotations
    all_rules = await _load_all_active_rules(db, chore_ids)
    all_rotations = await _load_all_rotations(db, chore_ids)
    
    # Pre-load existing assignments to avoid per-creation checks
    existing_assignments = await _load_existing_assignments_set(db, week_start, week_end)

    for chore in chores:
        rules = all_rules.get(chore.id, [])
        rotation = all_rotations.get(chore.id)

        if rules:
            await _generate_from_rules_optimized(
                db, chore, rules, rotation, week_dates, exclusion_set, existing_assignments
            )
        else:
            await _generate_legacy_optimized(
                db, chore, week_dates, exclusion_set, existing_assignments, all_rotations
            )

    await db.commit()


async def generate_daily_assignments(db: AsyncSession, today: date) -> None:
    """Generate assignments for today with rotation advancement."""
    from backend.routers.vacation import is_vacation_day
    if await is_vacation_day(db, today):
        logger.info("Skipping assignment generation — vacation day %s", today)
        return

    now = datetime.now(timezone.utc)
    chores = await _load_active_chores(db)
    chore_ids = [c.id for c in chores]
    
    all_rules = await _load_all_active_rules(db, chore_ids)
    all_rotations = await _load_all_rotations(db, chore_ids)
    existing_assignments = await _load_existing_assignments_set(db, today, today)

    for chore in chores:
        rules = all_rules.get(chore.id, [])
        rotation = all_rotations.get(chore.id)

        if rules:
            # Pre-compute which rules fire today
            created_wd = chore.created_at.weekday()
            created_dt = chore.created_at.date() if hasattr(chore.created_at, "date") else chore.created_at
            active_rules = [
                r for r in rules
                if r.recurrence != Recurrence.once
                and should_create_on_day(
                    r.recurrence, today, created_wd, r.custom_days,
                    created_at_date=created_dt,
                )
            ]

            if rotation and active_rules and should_advance_rotation(rotation, now):
                advance_rotation(rotation, now)

            for rule in active_rules:
                if rotation and int(rule.user_id) != int(
                    rotation.kid_ids[rotation.current_index]
                ):
                    continue
                _create_in_memory_if_missing(db, chore.id, rule.user_id, today, existing_assignments)
        else:
            if chore.recurrence == Recurrence.once:
                continue

            created_wd = chore.created_at.weekday()
            created_dt = chore.created_at.date() if hasattr(chore.created_at, "date") else chore.created_at
            if not should_create_on_day(
                chore.recurrence, today, created_wd, chore.custom_days,
                created_at_date=created_dt,
            ):
                continue

            if rotation:
                if should_advance_rotation(rotation, now):
                    advance_rotation(rotation, now)
                user_ids = [rotation.kid_ids[rotation.current_index]]
            else:
                user_ids = await _get_legacy_user_ids(db, chore.id)

            for uid in user_ids:
                _create_in_memory_if_missing(db, chore.id, uid, today, existing_assignments)

    await db.commit()


# ---------------------------------------------------------------------------
# Internal helpers (Optimized)
# ---------------------------------------------------------------------------

async def _load_all_active_rules(db: AsyncSession, chore_ids: list[int]) -> dict[int, list[ChoreAssignmentRule]]:
    if not chore_ids: return {}
    result = await db.execute(
        select(ChoreAssignmentRule).where(
            ChoreAssignmentRule.chore_id.in_(chore_ids),
            ChoreAssignmentRule.is_active == True,
        )
    )
    rules_map = {}
    for r in result.scalars().all():
        rules_map.setdefault(r.chore_id, []).append(r)
    return rules_map


async def _load_all_rotations(db: AsyncSession, chore_ids: list[int]) -> dict[int, ChoreRotation]:
    if not chore_ids: return {}
    result = await db.execute(
        select(ChoreRotation).where(ChoreRotation.chore_id.in_(chore_ids))
    )
    return {r.chore_id: r for r in result.scalars().all()}


async def _load_existing_assignments_set(db: AsyncSession, start: date, end: date) -> set[tuple[int, int, date]]:
    result = await db.execute(
        select(ChoreAssignment.chore_id, ChoreAssignment.user_id, ChoreAssignment.date)
        .where(ChoreAssignment.date >= start, ChoreAssignment.date <= end)
    )
    return {(r[0], r[1], r[2]) for r in result.all()}


def _create_in_memory_if_missing(
    db: AsyncSession, chore_id: int, user_id: int, day: date, 
    existing_set: set[tuple[int, int, date]]
) -> bool:
    if (chore_id, user_id, day) not in existing_set:
        db.add(ChoreAssignment(
            chore_id=chore_id, user_id=user_id, date=day, status=AssignmentStatus.pending
        ))
        existing_set.add((chore_id, user_id, day))
        return True
    return False


async def _generate_from_rules_optimized(
    db: AsyncSession, chore: Chore, rules: list[ChoreAssignmentRule], 
    rotation: ChoreRotation | None, week_dates: list[date], 
    exclusion_set: set[tuple[int, int, date]], 
    existing_assignments: set[tuple[int, int, date]]
) -> None:
    active_weekdays = _collect_active_weekdays(rules, chore) if rotation else None
    
    if rotation and rotation.last_rotated:
        lr = rotation.last_rotated
        reference_day = lr.date() if hasattr(lr, "date") else lr
    else:
        reference_day = date.today()

    for rule in rules:
        if rule.recurrence == Recurrence.once: continue
        created_dt = chore.created_at.date() if hasattr(chore.created_at, "date") else chore.created_at
        
        for day in week_dates:
            if not should_create_on_day(
                rule.recurrence, day, chore.created_at.weekday(), rule.custom_days,
                created_at_date=created_dt,
            ):
                continue

            if rotation and rotation.kid_ids:
                expected_kid = get_rotation_kid_for_day(rotation, day, reference_day, active_weekdays)
                if int(rule.user_id) != expected_kid:
                    await _remove_stale_rotation_assignment(db, chore.id, rule.user_id, day)
                    continue

            if (chore.id, rule.user_id, day) in exclusion_set:
                continue

            _create_in_memory_if_missing(db, chore.id, rule.user_id, day, existing_assignments)


async def _generate_legacy_optimized(
    db: AsyncSession, chore: Chore, week_dates: list[date], 
    exclusion_set: set[tuple[int, int, date]], 
    existing_assignments: set[tuple[int, int, date]],
    all_rotations: dict[int, ChoreRotation]
) -> None:
    if chore.recurrence == Recurrence.once: return

    # Determine assigned user IDs (legacy fallback)
    rules_result = await db.execute(
        select(ChoreAssignmentRule.user_id).where(
            ChoreAssignmentRule.chore_id == chore.id,
            ChoreAssignmentRule.is_active == True,
        )
    )
    user_ids = list(rules_result.scalars().all())

    if not user_ids:
        rotation = all_rotations.get(chore.id)
        if rotation and rotation.kid_ids:
            user_ids = [int(kid_id) for kid_id in rotation.kid_ids]
        else:
            user_ids = await _get_legacy_user_ids(db, chore.id)

    if not user_ids: return
    created_dt = chore.created_at.date() if hasattr(chore.created_at, "date") else chore.created_at

    for day in week_dates:
        if not should_create_on_day(
            chore.recurrence, day, chore.created_at.weekday(), chore.custom_days,
            created_at_date=created_dt,
        ):
            continue

        for user_id in user_ids:
            if (chore.id, user_id, day) in exclusion_set:
                continue
            _create_in_memory_if_missing(db, chore.id, user_id, day, existing_assignments)

# Re-using original helpers
async def _load_active_chores(db: AsyncSession) -> list[Chore]:
    result = await db.execute(select(Chore).where(Chore.is_active == True))
    return list(result.scalars().all())

async def _load_exclusion_set(db: AsyncSession, start: date, end: date) -> set[tuple[int, int, date]]:
    result = await db.execute(select(ChoreExclusion).where(ChoreExclusion.date >= start, ChoreExclusion.date <= end))
    return {(e.chore_id, e.user_id, e.date) for e in result.scalars().all()}

async def _get_legacy_user_ids(db: AsyncSession, chore_id: int) -> list[int]:
    result = await db.execute(select(ChoreAssignment.user_id).where(ChoreAssignment.chore_id == chore_id).distinct())
    return list(result.scalars().all())

async def _remove_stale_rotation_assignment(db: AsyncSession, chore_id: int, user_id: int, day: date) -> None:
    result = await db.execute(select(ChoreAssignment).where(
        ChoreAssignment.chore_id == chore_id, ChoreAssignment.user_id == user_id,
        ChoreAssignment.date == day, ChoreAssignment.status == AssignmentStatus.pending,
    ))
    stale = result.scalar_one_or_none()
    if stale: await db.delete(stale)

def _collect_active_weekdays(rules: list[ChoreAssignmentRule], chore: Chore) -> list[int] | None:
    weekdays: set[int] = set()
    for rule in rules:
        if rule.recurrence in (Recurrence.once,): continue
        if rule.recurrence == Recurrence.daily: return None
        if rule.recurrence == Recurrence.custom and rule.custom_days: weekdays.update(rule.custom_days)
        elif rule.recurrence in (Recurrence.weekly, Recurrence.fortnightly): weekdays.add(chore.created_at.weekday())
    return sorted(weekdays) if weekdays else None
