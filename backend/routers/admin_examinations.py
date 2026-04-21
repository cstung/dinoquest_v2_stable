"""Admin endpoints for managing examinations."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.database import get_db
from backend.models import User
from backend.dependencies import require_admin
from backend.examination_models import (
    TestItem, TestQuestion, TestAnswerOption, TestAttempt, QuestionLog,
    YouTubeGenerationLog,
)
from backend.examination_schemas import (
    TestCreate, TestUpdate, TestResponse, TestDetailResponse,
    QuestionCreate, QuestionUpdate, QuestionResponse,
    AnswerOptionCreate, AnswerOptionResponse,
    TestImportRequest, AdminAttemptResponse,
    YouTubeGenerateRequest, YouTubeGenerateResponse, SaveGeneratedRequest,
)
from backend.routers.examinations import _get_user_performance, _cleanup_expired_attempts
from backend.services.youtube_service import get_video_data
from backend.services.gpt_question_generator import generate_questions
import backend.config as config

router = APIRouter(prefix="/api/admin/examinations", tags=["admin-examinations"])


# ══════════════════════════════════════════════════════════════════════════
# STATIC ROUTES — must be declared BEFORE /{test_id} wildcard routes
# ══════════════════════════════════════════════════════════════════════════


# ── Test List & Create ───────────────────────────────────────────────────


@router.get("", response_model=list[TestResponse])
async def list_tests(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """List all tests (including inactive) for admin management."""
    stmt = select(TestItem).order_by(TestItem.created_at.desc())
    result = await db.execute(stmt)
    tests = result.scalars().all()

    out = []
    for t in tests:
        q_count = await db.execute(
            select(func.count(TestQuestion.id)).where(TestQuestion.test_id == t.id)
        )
        count = q_count.scalar() or 0
        resp = TestResponse.model_validate(t)
        resp.question_count = count
        out.append(resp)
    return out


@router.post("", response_model=TestResponse, status_code=201)
async def create_test(
    body: TestCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Create a new test."""
    test = TestItem(
        title=body.title,
        description=body.description,
        duration_minutes=body.duration_minutes,
        passing_score=body.passing_score,
        question_order=body.question_order,
        penalty_mode=body.penalty_mode,
        penalty_value=body.penalty_value,
        thumbnail_url=body.thumbnail_url,
        is_published=body.is_published,
        created_by=admin.id,
    )
    db.add(test)
    await db.commit()
    await db.refresh(test)

    resp = TestResponse.model_validate(test)
    resp.question_count = 0
    return resp



# ── Retry Requests (static path, MUST be before /{test_id}) ─────────────


@router.get("/retry-requests", response_model=list[AdminAttemptResponse])
async def list_retry_requests(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """List all attempts that are pending a retry approval."""
    stmt = (
        select(TestAttempt, User.display_name, User.username, TestItem.title)
        .outerjoin(User, User.id == TestAttempt.user_id)
        .outerjoin(TestItem, TestItem.id == TestAttempt.test_id)
        .where(
            TestAttempt.retry_requested == True,
            TestAttempt.retry_approved == False,
        )
        .order_by(TestAttempt.created_at.desc())
    )
    result = await db.execute(stmt)
    rows = result.all()

    out = []
    for attempt, display_name, username, test_title in rows:
        out.append(AdminAttemptResponse(
            attempt_id=attempt.id,
            test_id=attempt.test_id,
            user_id=attempt.user_id,
            user_name=display_name or username or f"User #{attempt.user_id}",
            test_name=test_title or f"Test #{attempt.test_id}",
            status=attempt.status.value,
            score=attempt.score,
            start_time=attempt.started_at,
            retry_requested=attempt.retry_requested,
            retry_approved=attempt.retry_approved,
        ))
    return out


# ── Unlock Attempt (static path, MUST be before /{test_id}) ─────────────


@router.post("/attempts/{attempt_id}/unlock")
async def unlock_attempt(
    attempt_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """Admin-only: approve retry so a user can take a quiz again."""
    result = await db.execute(select(TestAttempt).where(TestAttempt.id == attempt_id))
    attempt = result.scalar_one_or_none()
    if attempt is None:
        raise HTTPException(status_code=404, detail="Attempt not found")

    attempt.retry_approved = True
    await db.commit()
    return {"status": "unlocked"}


# ══════════════════════════════════════════════════════════════════════════
# PARAMETERIZED ROUTES — /{test_id} wildcard comes AFTER static routes
# ══════════════════════════════════════════════════════════════════════════


# ── Single Test CRUD ─────────────────────────────────────────────────────


@router.get("/{test_id}", response_model=TestDetailResponse)
async def get_test(
    test_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """Get a test with all its questions and options."""
    result = await db.execute(
        select(TestItem)
        .options(selectinload(TestItem.questions).selectinload(TestQuestion.options))
        .where(TestItem.id == test_id)
    )
    test = result.scalar_one_or_none()
    if test is None:
        raise HTTPException(status_code=404, detail="Test not found")

    resp = TestDetailResponse.model_validate(test)
    resp.question_count = len(test.questions)
    return resp


@router.put("/{test_id}", response_model=TestResponse)
async def update_test(
    test_id: int,
    body: TestUpdate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """Update a test's metadata."""
    result = await db.execute(select(TestItem).where(TestItem.id == test_id))
    test = result.scalar_one_or_none()
    if test is None:
        raise HTTPException(status_code=404, detail="Test not found")

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(test, field, value)
    test.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(test)

    q_count = await db.execute(
        select(func.count(TestQuestion.id)).where(TestQuestion.test_id == test.id)
    )
    resp = TestResponse.model_validate(test)
    resp.question_count = q_count.scalar() or 0
    return resp


@router.delete("/{test_id}", status_code=204)
async def delete_test(
    test_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """Soft-delete a test (set inactive)."""
    result = await db.execute(select(TestItem).where(TestItem.id == test_id))
    test = result.scalar_one_or_none()
    if test is None:
        raise HTTPException(status_code=404, detail="Test not found")

    test.is_active = False
    test.updated_at = datetime.now(timezone.utc)
    await db.commit()


# ── Question CRUD ────────────────────────────────────────────────────────


@router.post("/{test_id}/questions", response_model=QuestionResponse, status_code=201)
async def add_question(
    test_id: int,
    body: QuestionCreate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """Add a question to a test."""
    result = await db.execute(select(TestItem).where(TestItem.id == test_id))
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Test not found")

    question = TestQuestion(
        test_id=test_id,
        question_text=body.question_text,
        media_type=body.media_type,
        media_url=body.media_url,
        explanation=body.explanation,
        weight=body.weight,
        sort_order=body.sort_order,
        allow_multiple=body.allow_multiple,
    )
    db.add(question)
    await db.flush()

    for opt in body.options:
        db.add(TestAnswerOption(
            question_id=question.id,
            option_text=opt.option_text,
            is_correct=opt.is_correct,
            sort_order=opt.sort_order,
        ))

    await db.commit()

    result = await db.execute(
        select(TestQuestion)
        .options(selectinload(TestQuestion.options))
        .where(TestQuestion.id == question.id)
    )
    return result.scalar_one()


@router.put("/{test_id}/questions/{question_id}", response_model=QuestionResponse)
async def update_question(
    test_id: int,
    question_id: int,
    body: QuestionUpdate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """Update a question's metadata."""
    result = await db.execute(
        select(TestQuestion)
        .options(selectinload(TestQuestion.options))
        .where(TestQuestion.id == question_id, TestQuestion.test_id == test_id)
    )
    question = result.scalar_one_or_none()
    if question is None:
        raise HTTPException(status_code=404, detail="Question not found")

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(question, field, value)

    await db.commit()
    await db.refresh(question)
    return question


@router.delete("/{test_id}/questions/{question_id}", status_code=204)
async def delete_question(
    test_id: int,
    question_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """Delete a question and its options."""
    result = await db.execute(
        select(TestQuestion).where(
            TestQuestion.id == question_id, TestQuestion.test_id == test_id,
        )
    )
    question = result.scalar_one_or_none()
    if question is None:
        raise HTTPException(status_code=404, detail="Question not found")

    await db.delete(question)
    await db.commit()


# ── Answer Option management ─────────────────────────────────────────────


@router.post(
    "/{test_id}/questions/{question_id}/options",
    response_model=AnswerOptionResponse,
    status_code=201,
)
async def add_option(
    test_id: int,
    question_id: int,
    body: AnswerOptionCreate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """Add an answer option to a question."""
    result = await db.execute(
        select(TestQuestion).where(
            TestQuestion.id == question_id, TestQuestion.test_id == test_id,
        )
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Question not found")

    option = TestAnswerOption(
        question_id=question_id,
        option_text=body.option_text,
        is_correct=body.is_correct,
        sort_order=body.sort_order,
    )
    db.add(option)
    await db.commit()
    await db.refresh(option)
    return option


@router.delete(
    "/{test_id}/questions/{question_id}/options/{option_id}",
    status_code=204,
)
async def delete_option(
    test_id: int,
    question_id: int,
    option_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """Delete an answer option."""
    result = await db.execute(
        select(TestAnswerOption).where(
            TestAnswerOption.id == option_id,
            TestAnswerOption.question_id == question_id,
        )
    )
    option = result.scalar_one_or_none()
    if option is None:
        raise HTTPException(status_code=404, detail="Option not found")

    await db.delete(option)
    await db.commit()


# ── Bulk Import ──────────────────────────────────────────────────────────


@router.post("/{test_id}/import", status_code=201)
async def import_questions(
    test_id: int,
    body: TestImportRequest,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """Bulk-import questions into a test."""
    result = await db.execute(select(TestItem).where(TestItem.id == test_id))
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Test not found")

    count = 0
    for idx, item in enumerate(body.questions):
        q = TestQuestion(
            test_id=test_id,
            question_text=item.question_text,
            media_type=item.media_type,
            media_url=item.media_url,
            explanation=item.explanation,
            weight=item.weight,
            sort_order=idx,
            allow_multiple=item.allow_multiple,
        )
        db.add(q)
        await db.flush()

        for oi, opt in enumerate(item.options):
            db.add(TestAnswerOption(
                question_id=q.id,
                option_text=opt.option_text,
                is_correct=opt.is_correct,
                sort_order=oi,
            ))
        count += 1

    await db.commit()
    return {"imported": count}


# ── AI YouTube Generation ───────────────────────────────────────────────


@router.post("/generate-from-youtube", response_model=YouTubeGenerateResponse)
async def generate_from_youtube_endpoint(
    body: YouTubeGenerateRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """
    Step 1: Extract subtitles and generate questions with GPT-4o.
    This does NOT save the test yet.
    """
    # 1. Check daily rate limit
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    stmt = (
        select(func.count(YouTubeGenerationLog.id))
        .where(
            YouTubeGenerationLog.generated_by_user_id == admin.id,
            YouTubeGenerationLog.created_at >= today_start
        )
    )
    result = await db.execute(stmt)
    today_count = result.scalar() or 0
    
    limit = config.settings.YOUTUBE_GENERATE_DAILY_LIMIT
    if today_count >= limit:
        raise HTTPException(
            status_code=429, 
            detail=f"Daily limit of {limit} generations reached. Please try again tomorrow."
        )

    # 2. Fetch video data
    try:
        video_data = await get_video_data(body.youtube_url)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"YouTube extraction failed: {str(e)}")

    if not video_data["subtitle_available"]:
        raise HTTPException(
            status_code=422,
            detail="This video has no subtitles. Please try a different video."
        )

    # 3. Generate questions
    try:
        questions = await generate_questions(
            subtitle_text=video_data["subtitle_text"],
            video_title=video_data["video_title"],
            thumbnail_url=video_data["thumbnail_url"],
            n_questions=body.n_questions,
            difficulty=body.difficulty
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI generation failed: {str(e)}")

    if not questions:
        raise HTTPException(status_code=502, detail="AI failed to generate any valid questions.")

    # 4. Log to audit table
    log = YouTubeGenerationLog(
        video_id=video_data["video_id"],
        video_title=video_data["video_title"],
        youtube_url=body.youtube_url,
        n_questions=len(questions),
        generated_by_user_id=admin.id
    )
    db.add(log)
    await db.commit()

    # 5. Build exam_draft
    exam_draft = body.exam_config.copy()
    if not exam_draft.get("title"):
        exam_draft["title"] = video_data["video_title"]
    
    # Ensure some defaults if missing
    exam_draft.setdefault("passing_score", 5000)
    exam_draft.setdefault("duration_minutes", 15)

    return YouTubeGenerateResponse(
        video_title=video_data["video_title"],
        video_id=video_data["video_id"],
        thumbnail_url=video_data["thumbnail_url"],
        subtitle_available=True,
        questions=questions,
        exam_draft=exam_draft
    )


@router.post("/save-generated", status_code=201)
async def save_generated_test(
    body: SaveGeneratedRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """
    Step 2: Save the reviewed questions as a real test.
    """
    # 1. Create the test header
    config_data = body.exam_config
    test = TestItem(
        title=config_data.get("title", "Generated Test"),
        description=f"Generated from YouTube video.",
        duration_minutes=config_data.get("duration_minutes", 15),
        passing_score=config_data.get("passing_score", 5000),
        thumbnail_url=config_data.get("thumbnail_url"),
        created_by=admin.id,
        is_published=True
    )
    db.add(test)
    await db.flush()

    # 2. Add questions (reuse logic similar to bulk import)
    for idx, item in enumerate(body.questions):
        q = TestQuestion(
            test_id=test.id,
            question_text=item["question_text"],
            media_type="image",
            media_url=item.get("media_url"),
            weight=item.get("weight", 1),
            sort_order=idx,
            allow_multiple=item.get("allow_multiple", False),
        )
        db.add(q)
        await db.flush()

        for oi, opt in enumerate(item.get("options", [])):
            db.add(TestAnswerOption(
                question_id=q.id,
                option_text=opt["option_text"],
                is_correct=opt["is_correct"],
                sort_order=oi,
            ))

    await db.commit()
    return {"exam_id": test.id}


# ── Per-Test Analytics ───────────────────────────────────────────────────


@router.get("/{test_id}/analytics")
async def test_analytics(
    test_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """Basic analytics for a test."""
    result = await db.execute(select(TestItem).where(TestItem.id == test_id))
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Test not found")

    attempts_result = await db.execute(
        select(TestAttempt).where(TestAttempt.test_id == test_id)
    )
    attempts = attempts_result.scalars().all()
    total_attempts = len(attempts)
    completed = [a for a in attempts if a.score is not None]
    scores = [a.score for a in completed]

    avg_score = sum(scores) / len(scores) if scores else 0
    max_score = max(scores) if scores else 0
    min_score = min(scores) if scores else 0

    question_stats = []
    q_result = await db.execute(
        select(TestQuestion).where(TestQuestion.test_id == test_id).order_by(TestQuestion.sort_order)
    )
    for q in q_result.scalars().all():
        log_result = await db.execute(
            select(QuestionLog).where(QuestionLog.question_id == q.id)
        )
        logs = log_result.scalars().all()
        times = [l.time_spent_seconds for l in logs if l.time_spent_seconds is not None]
        avg_time = sum(times) / len(times) if times else 0

        correct_ids = set()
        opt_result = await db.execute(
            select(TestAnswerOption).where(
                TestAnswerOption.question_id == q.id,
                TestAnswerOption.is_correct == True,
            )
        )
        correct_ids = {o.id for o in opt_result.scalars().all()}
        correct_count = sum(
            1 for l in logs
            if l.selected_option_ids and set(l.selected_option_ids) == correct_ids
        )
        total_answers = len(logs)

        question_stats.append({
            "question_id": q.id,
            "question_text": q.question_text[:80],
            "avg_time_seconds": round(avg_time, 1),
            "correct_rate": round(correct_count / total_answers, 2) if total_answers else 0,
            "total_answers": total_answers,
        })

    return {
        "test_id": test_id,
        "total_attempts": total_attempts,
        "completed_attempts": len(completed),
        "avg_score": round(avg_score),
        "max_score": max_score,
        "min_score": min_score,
        "questions": question_stats,
    }


# ── Attempts ─────────────────────────────────────────────────────────────


@router.get("/{test_id}/attempts", response_model=list[AdminAttemptResponse])
async def list_test_attempts(
    test_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """List all attempts for a specific test."""
    result = await db.execute(
        select(TestAttempt, User.display_name, User.username)
        .options(selectinload(TestAttempt.test))
        .outerjoin(User, User.id == TestAttempt.user_id)
        .where(TestAttempt.test_id == test_id)
        .order_by(TestAttempt.created_at.desc())
    )
    rows = result.all()
    
    # Lazy cleanup
    attempts = [r[0] for r in rows]
    if await _cleanup_expired_attempts(db, attempts):
        await db.commit()

    out = []
    for attempt, display_name, username in rows:
        out.append(AdminAttemptResponse(
            attempt_id=attempt.id,
            test_id=attempt.test_id,
            user_id=attempt.user_id,
            user_name=display_name or username or f"User #{attempt.user_id}",
            status=attempt.status.value,
            score=attempt.score,
            start_time=attempt.started_at,
            retry_requested=attempt.retry_requested,
            retry_approved=attempt.retry_approved,
        ))
    return out


# ── Attempt Time Logs ────────────────────────────────────────────────────


@router.get("/{test_id}/attempts/{attempt_id}/logs")
async def get_attempt_logs(
    test_id: int,
    attempt_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """Get detailed per-question time logs for a specific attempt."""
    attempt_result = await db.execute(
        select(TestAttempt).where(
            TestAttempt.id == attempt_id,
            TestAttempt.test_id == test_id,
        )
    )
    attempt = attempt_result.scalar_one_or_none()
    if attempt is None:
        raise HTTPException(status_code=404, detail="Attempt not found")

    # Get user name
    user_result = await db.execute(select(User).where(User.id == attempt.user_id))
    user = user_result.scalar_one_or_none()
    user_name = (user.display_name or user.username) if user else f"User #{attempt.user_id}"

    # Get all question logs across all attempts for average duration calculation
    all_logs_result = await db.execute(
        select(QuestionLog, TestAttempt.test_id)
        .join(TestAttempt, TestAttempt.id == QuestionLog.attempt_id)
        .where(TestAttempt.test_id == test_id)
    )
    all_logs = all_logs_result.all()
    avg_times = {}
    for log, _ in all_logs:
        if log.time_spent_seconds is not None:
            if log.question_id not in avg_times:
                avg_times[log.question_id] = []
            avg_times[log.question_id].append(log.time_spent_seconds)

    for q_id, times in avg_times.items():
        avg_times[q_id] = sum(times) / len(times) if times else 0

    # Get all question logs for this attempt
    logs_result = await db.execute(
        select(QuestionLog)
        .where(QuestionLog.attempt_id == attempt_id)
    )
    logs = {l.question_id: l for l in logs_result.scalars().all()}

    # Get question texts and correct answers
    questions_result = await db.execute(
        select(TestQuestion)
        .options(selectinload(TestQuestion.options))
        .where(TestQuestion.test_id == test_id)
        .order_by(TestQuestion.sort_order)
    )
    questions = questions_result.scalars().all()

    log_entries = []
    for order, q in enumerate(questions, start=1):
        log = logs.get(q.id)
        duration = log.time_spent_seconds if log and log.time_spent_seconds is not None else 0
        correct_ids = {o.id for o in q.options if o.is_correct}
        selected = set(log.selected_option_ids) if log and log.selected_option_ids else set()

        is_skipped = not selected
        is_correct = selected == correct_ids if selected else False

        # Behavior Classification
        avg_duration = avg_times.get(q.id, 0)
        behavior_label = "Skipped"
        if not is_skipped:
            if duration < avg_duration and is_correct:
                behavior_label = "Mastered"
            elif duration >= avg_duration and is_correct:
                behavior_label = "Careful"
            elif duration < avg_duration and not is_correct:
                behavior_label = "Guessing"
            else:
                behavior_label = "Struggling"

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
            "duration": duration,
            "behavior_label": behavior_label,
        })

    total_time = None
    if attempt.started_at and attempt.finished_at:
        total_time = int((attempt.finished_at - attempt.started_at).total_seconds())

    return {
        "attempt_id": attempt.id,
        "user_name": user_name,
        "score": attempt.score,
        "status": attempt.status.value,
        "start_time": attempt.started_at.isoformat() if attempt.started_at else None,
        "end_time": attempt.finished_at.isoformat() if attempt.finished_at else None,
        "total_time": total_time,
        "questions": log_entries,
    }


# ── Performance ──────────────────────────────────────────────────────────


@router.get("/{test_id}/performance")
async def get_test_performance(
    test_id: int,
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """Admin-only: fetch the performance analysis for a specific user."""
    return await _get_user_performance(db, test_id, user_id)
