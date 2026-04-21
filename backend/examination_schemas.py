"""Pydantic schemas for the Examination module."""

from datetime import datetime
from pydantic import BaseModel, Field
from backend.examination_models import (
    QuestionMediaType, TestStatus, QuestionOrderMode, PenaltyMode,
)


# ── Answer Options ───────────────────────────────────────────────────────

class AnswerOptionCreate(BaseModel):
    option_text: str
    is_correct: bool = False
    sort_order: int = 0


class AnswerOptionResponse(BaseModel):
    id: int
    option_text: str
    is_correct: bool
    sort_order: int

    model_config = {"from_attributes": True}


class AnswerOptionPublic(BaseModel):
    """Public view — hides is_correct."""
    id: int
    option_text: str
    sort_order: int

    model_config = {"from_attributes": True}


# ── Questions ────────────────────────────────────────────────────────────

class QuestionCreate(BaseModel):
    question_text: str
    media_type: QuestionMediaType = QuestionMediaType.none
    media_url: str | None = None
    explanation: str | None = None
    weight: int = Field(default=1, ge=1)
    sort_order: int = 0
    allow_multiple: bool = False
    options: list[AnswerOptionCreate] = []


class QuestionUpdate(BaseModel):
    question_text: str | None = None
    media_type: QuestionMediaType | None = None
    media_url: str | None = None
    explanation: str | None = None
    weight: int | None = None
    sort_order: int | None = None
    allow_multiple: bool | None = None


class QuestionResponse(BaseModel):
    id: int
    test_id: int
    question_text: str
    media_type: QuestionMediaType
    media_url: str | None
    explanation: str | None
    weight: int
    sort_order: int
    allow_multiple: bool
    options: list[AnswerOptionResponse] = []

    model_config = {"from_attributes": True}


class QuestionPublic(BaseModel):
    """User-facing — no correct answers, no explanation."""
    id: int
    question_text: str
    media_type: QuestionMediaType
    media_url: str | None
    weight: int
    sort_order: int
    allow_multiple: bool
    options: list[AnswerOptionPublic] = []

    model_config = {"from_attributes": True}


# ── Tests ────────────────────────────────────────────────────────────────

class TestCreate(BaseModel):
    title: str = Field(max_length=200)
    description: str | None = None
    duration_minutes: int = Field(gt=0)
    passing_score: int | None = None
    question_order: QuestionOrderMode = QuestionOrderMode.fixed
    penalty_mode: PenaltyMode = PenaltyMode.none
    penalty_value: int = Field(default=0, ge=0)
    thumbnail_url: str | None = None
    is_published: bool = True


class TestUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    duration_minutes: int | None = None
    passing_score: int | None = None
    question_order: QuestionOrderMode | None = None
    penalty_mode: PenaltyMode | None = None
    penalty_value: int | None = None
    is_active: bool | None = None
    is_published: bool | None = None
    thumbnail_url: str | None = None


class TestResponse(BaseModel):
    id: int
    title: str
    description: str | None
    duration_minutes: int
    passing_score: int | None
    question_order: QuestionOrderMode
    penalty_mode: PenaltyMode
    penalty_value: int
    is_active: bool
    is_published: bool
    created_by: int
    created_at: datetime
    question_count: int = 0
    thumbnail_url: str | None = None

    model_config = {"from_attributes": True}


class TestDetailResponse(TestResponse):
    questions: list[QuestionResponse] = []


class TestPublicResponse(BaseModel):
    """User-facing list entry — hides admin config."""
    id: int
    title: str
    description: str | None
    duration_minutes: int
    question_count: int = 0
    is_active: bool
    is_published: bool
    thumbnail_url: str | None = None

    model_config = {"from_attributes": True}


# ── Attempts ─────────────────────────────────────────────────────────────

class AttemptStartResponse(BaseModel):
    attempt_id: int
    test_id: int
    started_at: datetime
    duration_minutes: int
    questions: list[QuestionPublic] = []


class QuestionLogRequest(BaseModel):
    question_id: int
    selected_option_ids: list[int] = []
    entry_time: datetime | None = None
    exit_time: datetime | None = None
    time_spent_seconds: float | None = None


class AttemptSubmitResponse(BaseModel):
    attempt_id: int
    score: int
    max_score: int
    passed: bool | None = None
    xp_awarded: int


class AttemptResponse(BaseModel):
    id: int
    test_id: int
    user_id: int
    status: TestStatus
    started_at: datetime
    finished_at: datetime | None
    score: int | None
    max_score: int
    retry_requested: bool = False
    retry_approved: bool = False
    retry_state: str | None = None
    model_config = {"from_attributes": True}


class AdminAttemptResponse(BaseModel):
    attempt_id: int
    test_id: int | None = None
    user_id: int | None = None
    user_name: str
    test_name: str | None = None
    status: str
    score: int | None = None
    start_time: datetime | None = None
    retry_requested: bool = False
    retry_approved: bool = False
    retry_state: str | None = None


# ── Import ───────────────────────────────────────────────────────────────

class QuestionImportItem(BaseModel):
    question_text: str
    media_type: QuestionMediaType = QuestionMediaType.none
    media_url: str | None = None
    explanation: str | None = None
    weight: int = 1
    allow_multiple: bool = False
    options: list[AnswerOptionCreate] = []


class TestImportRequest(BaseModel):
    questions: list[QuestionImportItem]

class GlobalAnalyticsResponse(BaseModel):
    test_id: int
    test_name: str
    attempt_count: int
    completed_count: int
    avg_score: int
    avg_time: int
    completion_rate: float

# -- AI Generation --------------------------------------------------------

class YouTubeGenerateRequest(BaseModel):
    youtube_url: str
    n_questions: int = Field(ge=1, le=30, default=10)
    difficulty: str = Field(default="medium", pattern="^(easy|medium|hard)$")
    exam_config: dict = {}  # title, passing_score, duration, is_randomized, penalty_value


class YouTubeGenerateResponse(BaseModel):
    video_title: str
    video_id: str
    thumbnail_url: str
    subtitle_available: bool
    questions: list[dict]
    exam_draft: dict


class SaveGeneratedRequest(BaseModel):
    exam_config: dict
    questions: list[dict]
