"""Examination module models — kept separate from the core chore models."""

import enum
from datetime import datetime

from sqlalchemy import (
    Integer, String, Text, Boolean, Float, DateTime, Enum, JSON,
    ForeignKey, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from backend.database import Base


class QuestionMediaType(str, enum.Enum):
    none = "none"
    image = "image"
    youtube = "youtube"


class TestStatus(str, enum.Enum):
    in_progress = "in_progress"
    submitted = "submitted"
    timed_out = "timed_out"
    unfinished = "unfinished"


class QuestionOrderMode(str, enum.Enum):
    fixed = "fixed"
    random = "random"


class PenaltyMode(str, enum.Enum):
    none = "none"           # wrong answers score 0
    absolute = "absolute"   # wrong answers deduct penalty_value points


class TestItem(Base):
    """A test/examination created by an admin."""
    __tablename__ = "exam_tests"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    passing_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    question_order: Mapped[QuestionOrderMode] = mapped_column(
        Enum(QuestionOrderMode), default=QuestionOrderMode.fixed,
    )
    penalty_mode: Mapped[PenaltyMode] = mapped_column(
        Enum(PenaltyMode), default=PenaltyMode.none,
    )
    penalty_value: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_published: Mapped[bool] = mapped_column(Boolean, default=True)
    thumbnail_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    questions = relationship(
        "TestQuestion", back_populates="test", cascade="all, delete-orphan",
        order_by="TestQuestion.sort_order",
    )
    creator = relationship("User", foreign_keys=[created_by])


class TestQuestion(Base):
    """A single question belonging to a test."""
    __tablename__ = "exam_questions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    test_id: Mapped[int] = mapped_column(ForeignKey("exam_tests.id"), nullable=False)
    question_text: Mapped[str] = mapped_column(Text, nullable=False)
    media_type: Mapped[QuestionMediaType] = mapped_column(
        Enum(QuestionMediaType), default=QuestionMediaType.none,
    )
    media_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    weight: Mapped[int] = mapped_column(Integer, default=1)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    allow_multiple: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    test = relationship("TestItem", back_populates="questions")
    options = relationship(
        "TestAnswerOption", back_populates="question", cascade="all, delete-orphan",
        order_by="TestAnswerOption.sort_order",
    )


class TestAnswerOption(Base):
    """An answer option for a question."""
    __tablename__ = "exam_answer_options"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    question_id: Mapped[int] = mapped_column(ForeignKey("exam_questions.id"), nullable=False)
    option_text: Mapped[str] = mapped_column(Text, nullable=False)
    is_correct: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    question = relationship("TestQuestion", back_populates="options")


class TestAttempt(Base):
    """Records one user sitting of a test."""
    __tablename__ = "exam_attempts"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    test_id: Mapped[int] = mapped_column(ForeignKey("exam_tests.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    status: Mapped[TestStatus] = mapped_column(Enum(TestStatus), default=TestStatus.in_progress)
    started_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_score: Mapped[int] = mapped_column(Integer, default=10000)
    is_locked: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    retry_requested: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    retry_approved: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    test = relationship("TestItem")
    user = relationship("User", foreign_keys=[user_id])
    logs = relationship(
        "QuestionLog", back_populates="attempt", cascade="all, delete-orphan",
    )


class QuestionLog(Base):
    """Per-question interaction log within a test attempt."""
    __tablename__ = "exam_question_logs"
    __table_args__ = (UniqueConstraint("attempt_id", "question_id"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    attempt_id: Mapped[int] = mapped_column(ForeignKey("exam_attempts.id"), nullable=False)
    question_id: Mapped[int] = mapped_column(ForeignKey("exam_questions.id"), nullable=False)
    selected_option_ids: Mapped[list | None] = mapped_column(JSON, nullable=True)
    entry_time: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    exit_time: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    time_spent_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)

    attempt = relationship("TestAttempt", back_populates="logs")
    question = relationship("TestQuestion")


class YouTubeGenerationLog(Base):
    """Audit log for YouTube-to-Quiz generations."""
    __tablename__ = "youtube_generation_log"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    video_id: Mapped[str] = mapped_column(String, nullable=False)
    video_title: Mapped[str | None] = mapped_column(String, nullable=True)
    youtube_url: Mapped[str] = mapped_column(String, nullable=False)
    n_questions: Mapped[int] = mapped_column(Integer, nullable=False)
    generated_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user = relationship("User")
