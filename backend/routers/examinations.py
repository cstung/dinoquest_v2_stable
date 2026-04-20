"""User-facing examination endpoints."""

import random
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.database import get_db
from backend.models import User, PointTransaction, PointType
from backend.dependencies import get_current_user
from backend.examination_models import (
    TestItem, TestQuestion, TestAnswerOption, TestAttempt, TestStatus,
    QuestionLog, QuestionOrderMode, PenaltyMode,
)
from backend.examination_schemas import (
    TestPublicResponse, AttemptStartResponse, QuestionPublic,
    AnswerOptionPublic, QuestionLogRequest, AttemptSubmitResponse,
    AttemptResponse,
)

router = APIRouter(prefix="/api/examinations", tags=["examinations"])


@router.get("", response_model=list[TestPublicResponse])
async def list_tests(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all active tests available for the current user."""
    stmt = (
        select(TestItem)
        .where(TestItem.is_active == True)
        .order_by(TestItem.created_at.desc())
    )
    result = await db.execute(stmt)
    tests = result.scalars().all()

    out = []
    for t in tests:
        q_count = await db.execute(
            select(func.count(TestQuestion.id)).where(TestQuestion.test_id == t.id)
        )
        count = q_count.scalar() or 0
        resp = TestPublicResponse.model_validate(t)
        resp.question_count = count
        out.append(resp)
    return out


@router.get("/attempts", response_model=list[AttemptResponse])
async def list_my_attempts(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all attempts by the current user. Performs lazy cleanup."""
    stmt = (
        select(TestAttempt)
        .options(selectinload(TestAttempt.test))
        .where(TestAttempt.user_id == current_user.id)
        .order_by(TestAttempt.created_at.desc())
    )
    result = await db.execute(stmt)
    attempts = result.scalars().all()
    
    if await _cleanup_expired_attempts(db, attempts):
        await db.commit()
        
    return attempts


@router.get("/attempts/{attempt_id}/logs")
async def get_my_attempt_logs(
    attempt_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get detailed logs for a user's own attempt."""
    result = await db.execute(
        select(TestAttempt).where(
            TestAttempt.id == attempt_id,
            TestAttempt.user_id == current_user.id,
        )
    )
    attempt = result.scalar_one_or_none()
    if attempt is None:
        raise HTTPException(status_code=404, detail="Attempt not found")

    # Get logs
    logs_result = await db.execute(select(QuestionLog).where(QuestionLog.attempt_id == attempt_id))
    logs = {l.question_id: l for l in logs_result.scalars().all()}

    # Get questions
    q_result = await db.execute(
        select(TestQuestion)
        .options(selectinload(TestQuestion.options))
        .where(TestQuestion.test_id == attempt.test_id)
        .order_by(TestQuestion.sort_order)
    )
    questions = q_result.scalars().all()

    log_entries = []
    for order, q in enumerate(questions, start=1):
        log = logs.get(q.id)
        correct_ids = {o.id for o in q.options if o.is_correct}
        selected = set(log.selected_option_ids) if log and log.selected_option_ids else set()
        
        is_skipped = not selected
        is_correct = selected == correct_ids if selected else False

        # Map selected option IDs to text
        selected_texts = []
        if selected:
            for o in q.options:
                if o.id in selected:
                    selected_texts.append(o.option_text)
                    
        log_entries.append({
            "question_id": q.id,
            "order": order,
            "question_text": q.question_text,
            "selected_answer": ", ".join(selected_texts) if selected_texts else None,
            "is_correct": is_correct,
            "is_skipped": is_skipped,
            "duration": log.time_spent_seconds if log else 0,
        })

    return {
        "attempt_id": attempt.id,
        "test_id": attempt.test_id,
        "score": attempt.score,
        "status": attempt.status.value,
        "start_time": attempt.started_at,
        "end_time": attempt.finished_at,
        "questions": log_entries,
    }


@router.post("/{test_id}/start", response_model=AttemptStartResponse)
async def start_test(
    test_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Start a new test attempt for the current user."""
    # Check the test exists
    result = await db.execute(
        select(TestItem)
        .options(selectinload(TestItem.questions).selectinload(TestQuestion.options))
        .where(TestItem.id == test_id, TestItem.is_active == True)
    )
    test = result.scalar_one_or_none()
    if test is None:
        raise HTTPException(status_code=404, detail="Test not found or inactive")

    if not test.questions:
        raise HTTPException(status_code=400, detail="Test has no questions")

    existing_in_progress_res = await db.execute(
        select(TestAttempt).where(
            TestAttempt.test_id == test_id,
            TestAttempt.user_id == current_user.id,
            TestAttempt.status == TestStatus.in_progress,
        )
    )
    existing_in_progress = existing_in_progress_res.scalar_one_or_none()

    if existing_in_progress:
        # Check if it has expired
        deadline = existing_in_progress.started_at.replace(tzinfo=timezone.utc) + timedelta(minutes=test.duration_minutes)
        if datetime.now(timezone.utc) > deadline + timedelta(seconds=30):
            # Auto-transition to unfinished
            existing_in_progress.status = TestStatus.unfinished
            existing_in_progress.finished_at = datetime.now(timezone.utc)
            await db.commit()
            # Now proceed to the "Check for past completed attempts" logic which will block it
        else:
            raise HTTPException(status_code=400, detail="You already have an active attempt for this test")
        
    # Check for past completed or unfinished attempts
    past_attempts = await db.execute(
        select(TestAttempt).where(
            TestAttempt.test_id == test_id,
            TestAttempt.user_id == current_user.id,
            TestAttempt.status.in_([TestStatus.submitted, TestStatus.timed_out, TestStatus.unfinished])
        ).order_by(TestAttempt.created_at.desc())
    )
    last_attempt = past_attempts.scalars().first()

    if last_attempt:
        if not last_attempt.retry_requested:
            raise HTTPException(status_code=403, detail="ATTEMPT_LOCKED")
            
        if last_attempt.retry_requested and not last_attempt.retry_approved:
            raise HTTPException(status_code=403, detail="Waiting for admin approval")
        
        # If retry_approved is True, they can proceed to start a new attempt.

    now = datetime.now(timezone.utc)
    attempt = TestAttempt(
        test_id=test_id,
        user_id=current_user.id,
        started_at=now,
    )
    db.add(attempt)
    await db.commit()
    await db.refresh(attempt)

    # Build question list
    questions = list(test.questions)
    if test.question_order == QuestionOrderMode.random:
        random.shuffle(questions)

    q_public = []
    for q in questions:
        opts = [AnswerOptionPublic.model_validate(o) for o in q.options]
        qp = QuestionPublic(
            id=q.id,
            question_text=q.question_text,
            media_type=q.media_type,
            media_url=q.media_url,
            weight=q.weight,
            sort_order=q.sort_order,
            allow_multiple=q.allow_multiple,
            options=opts,
        )
        q_public.append(qp)

    return AttemptStartResponse(
        attempt_id=attempt.id,
        test_id=test.id,
        started_at=attempt.started_at,
        duration_minutes=test.duration_minutes,
        questions=q_public,
    )


@router.post("/{test_id}/request-retry")
async def request_retry(
    test_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Request a retry for a test."""
    past_attempts = await db.execute(
        select(TestAttempt).where(
            TestAttempt.test_id == test_id,
            TestAttempt.user_id == current_user.id,
            TestAttempt.status.in_([TestStatus.submitted, TestStatus.timed_out, TestStatus.unfinished])
        ).order_by(TestAttempt.created_at.desc())
    )
    last_attempt = past_attempts.scalars().first()

    if not last_attempt:
        raise HTTPException(status_code=400, detail="No completed attempts found to retry.")
        
    if last_attempt.retry_requested and not last_attempt.retry_approved:
        raise HTTPException(status_code=400, detail="Retry already pending.")
        
    last_attempt.retry_requested = True
    last_attempt.retry_approved = False
    await db.commit()
    
    return {"status": "retry_requested"}


@router.post("/attempts/{attempt_id}/log")
async def log_question(
    attempt_id: int,
    body: QuestionLogRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Save/update an answer for a question (auto-save)."""
    attempt = await _get_active_attempt(db, attempt_id, current_user.id)

    # Upsert the question log
    result = await db.execute(
        select(QuestionLog).where(
            QuestionLog.attempt_id == attempt.id,
            QuestionLog.question_id == body.question_id,
        )
    )
    log = result.scalar_one_or_none()

    if log is None:
        log = QuestionLog(
            attempt_id=attempt.id,
            question_id=body.question_id,
        )
        db.add(log)

    log.selected_option_ids = body.selected_option_ids
    log.entry_time = body.entry_time
    log.exit_time = body.exit_time
    log.time_spent_seconds = body.time_spent_seconds

    await db.commit()
    return {"status": "saved"}


@router.post("/attempts/{attempt_id}/abandon")
async def abandon_test(
    attempt_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark an in-progress attempt as unfinished."""
    attempt = await _get_active_attempt(db, attempt_id, current_user.id)
    attempt.status = TestStatus.unfinished
    attempt.finished_at = datetime.now(timezone.utc)
    await db.commit()
    return {"status": "abandoned"}


@router.post("/attempts/{attempt_id}/submit", response_model=AttemptSubmitResponse)
async def submit_test(
    attempt_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Submit a test attempt. Calculates score, awards XP."""
    attempt = await _get_active_attempt(db, attempt_id, current_user.id)

    # Load the test with questions and options
    test_result = await db.execute(
        select(TestItem)
        .options(selectinload(TestItem.questions).selectinload(TestQuestion.options))
        .where(TestItem.id == attempt.test_id)
    )
    test = test_result.scalar_one()

    # Server-side timer validation
    now = datetime.now(timezone.utc)
    deadline = attempt.started_at.replace(tzinfo=timezone.utc) + timedelta(minutes=test.duration_minutes)
    timed_out = now > deadline + timedelta(seconds=30)  # 30s grace period

    # Load all logs for this attempt
    logs_result = await db.execute(
        select(QuestionLog).where(QuestionLog.attempt_id == attempt.id)
    )
    logs = {l.question_id: l for l in logs_result.scalars().all()}

    # Score calculation
    total_weight = sum(q.weight for q in test.questions)
    raw_score = 0

    for q in test.questions:
        log = logs.get(q.id)
        correct_ids = {o.id for o in q.options if o.is_correct}

        if log and log.selected_option_ids:
            selected = set(log.selected_option_ids)
            if selected == correct_ids:
                raw_score += q.weight
            elif test.penalty_mode == PenaltyMode.absolute:
                raw_score -= test.penalty_value
        # else: unanswered — scored as 0

    # Normalize to 0–10,000 range, flooring at 0
    if total_weight > 0:
        normalized = max(0, int((raw_score / total_weight) * 10000))
    else:
        normalized = 0

    # Determine pass/fail
    passed = None
    if test.passing_score is not None:
        passed = normalized >= test.passing_score

    # Finalize attempt
    attempt.status = TestStatus.timed_out if timed_out else TestStatus.submitted
    attempt.finished_at = now
    attempt.score = normalized

    # Award XP (1 test point = 1 XP)
    xp_amount = normalized
    if xp_amount > 0:
        current_user.points_balance += xp_amount
        current_user.total_points_earned += xp_amount
        tx = PointTransaction(
            user_id=current_user.id,
            amount=xp_amount,
            type=PointType.examination_score,
            description=f"Examination: {test.title} — Score {normalized}/10000",
            reference_id=attempt.id,
        )
        db.add(tx)

    await db.commit()

    return AttemptSubmitResponse(
        attempt_id=attempt.id,
        score=normalized,
        max_score=10000,
        passed=passed,
        xp_awarded=xp_amount,
    )


async def _get_active_attempt(
    db: AsyncSession, attempt_id: int, user_id: int,
) -> TestAttempt:
    """Helper: fetch an in-progress attempt owned by user_id."""
    result = await db.execute(
        select(TestAttempt)
        .options(selectinload(TestAttempt.test))
        .where(
            TestAttempt.id == attempt_id,
            TestAttempt.user_id == user_id,
        )
    )
    attempt = result.scalar_one_or_none()
    if attempt is None:
        raise HTTPException(status_code=404, detail="Attempt not found")
        
    # Check for expiration
    if attempt.status == TestStatus.in_progress:
        deadline = attempt.started_at.replace(tzinfo=timezone.utc) + timedelta(minutes=attempt.test.duration_minutes)
        if datetime.now(timezone.utc) > deadline + timedelta(seconds=30):
            attempt.status = TestStatus.unfinished
            attempt.finished_at = datetime.now(timezone.utc)
            await db.commit()
            raise HTTPException(status_code=400, detail="Attempt already submitted")

    if attempt.status != TestStatus.in_progress:
        raise HTTPException(status_code=400, detail="Attempt already submitted")
    return attempt


async def _cleanup_expired_attempts(db: AsyncSession, attempts: list[TestAttempt]) -> bool:
    """
    Lazy cleanup: check for expired in_progress attempts in the list and mark them unfinished.
    Returns True if any attempts were updated.
    """
    now = datetime.now(timezone.utc)
    updated = False
    for a in attempts:
        if a.status == TestStatus.in_progress:
            # Need to ensure a.test is loaded
            if a.test:
                deadline = a.started_at.replace(tzinfo=timezone.utc) + timedelta(minutes=a.test.duration_minutes)
                if now > deadline + timedelta(seconds=30):
                    a.status = TestStatus.unfinished
                    a.finished_at = now
                    updated = True
    return updated


async def _get_user_performance(db: AsyncSession, test_id: int, user_id: int):
    attempts_query = await db.execute(
        select(TestAttempt)
        .where(
            TestAttempt.test_id == test_id,
            TestAttempt.user_id == user_id,
            TestAttempt.status.in_([TestStatus.submitted, TestStatus.timed_out])
        )
        .order_by(TestAttempt.created_at.desc())
        .limit(5)
    )
    attempts = attempts_query.scalars().all()
    
    if not attempts:
        return {"user_id": user_id, "attempts": [], "questions": []}

    attempt_list = [{"attempt_id": a.id, "score": a.score} for a in attempts]
    attempt_ids = [a.id for a in attempts]

    # Limit to 100 questions
    questions_query = await db.execute(
        select(TestQuestion)
        .options(selectinload(TestQuestion.options))
        .where(TestQuestion.test_id == test_id)
        .order_by(TestQuestion.sort_order)
        .limit(100)
    )
    questions = questions_query.scalars().all()

    logs_query = await db.execute(
        select(QuestionLog)
        .where(QuestionLog.attempt_id.in_(attempt_ids))
    )
    all_logs = logs_query.scalars().all()

    log_map = {}
    for log in all_logs:
        if log.question_id not in log_map:
            log_map[log.question_id] = {}
        log_map[log.question_id][log.attempt_id] = log

    question_list = []
    for q in questions:
        q_attempts = []
        correct_ids = {o.id for o in q.options if o.is_correct}
        for a in attempts:
            log = log_map.get(q.id, {}).get(a.id)
            if log:
                selected = set(log.selected_option_ids) if log.selected_option_ids else set()
                is_correct = selected == correct_ids if selected else False
                is_skipped = not selected
                q_attempts.append({
                    "attempt_id": a.id, 
                    "duration": log.time_spent_seconds if log.time_spent_seconds else 0, 
                    "is_correct": is_correct,
                    "is_skipped": is_skipped
                })
            else:
                q_attempts.append({
                    "attempt_id": a.id,
                    "duration": 0,
                    "is_correct": False,
                    "is_skipped": True
                })
        question_list.append({
            "question_id": q.id,
            "attempts": q_attempts
        })

    return {
        "user_id": user_id,
        "attempts": attempt_list,
        "questions": question_list
    }


@router.get("/{test_id}/performance")
async def get_my_performance(
    test_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Kid-facing API to view their own performance progression."""
    return await _get_user_performance(db, test_id, current_user.id)

