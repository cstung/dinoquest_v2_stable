import logging
from pathlib import Path

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase

from backend.config import settings

logger = logging.getLogger(__name__)


def _prepare_sqlite_path(database_url: str) -> None:
    """Ensure SQLite target directory exists before engine connects."""
    prefix = "sqlite+aiosqlite:////"
    if not database_url.startswith(prefix):
        return

    db_file = Path("/" + database_url[len(prefix):])
    db_file.parent.mkdir(parents=True, exist_ok=True)
    logger.info("Using DB at: %s", database_url)




engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    connect_args={"check_same_thread": False},
)

async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def init_db():
    _prepare_sqlite_path(settings.DATABASE_URL)
    async with engine.begin() as conn:
        # Enable WAL mode
        await conn.exec_driver_sql("PRAGMA journal_mode=WAL")
        from backend.models import (  # noqa: F401
            User, Chore, ChoreAssignment, ChoreCategory, ChoreRotation,
            ChoreExclusion, ChoreAssignmentRule, QuestTemplate,
            Reward, RewardRedemption, PointTransaction,
            Achievement, UserAchievement, WishlistItem, SeasonalEvent,
            Notification, SpinResult, ApiKey, AuditLog, AppSetting,
            InviteCode, RefreshToken, PushSubscription,
            AvatarItem, UserAvatarItem,
            Shoutout, VacationPeriod,
        )
        from backend.examination_models import (  # noqa: F401
            TestItem, TestQuestion, TestAnswerOption, TestAttempt, QuestionLog,
            YouTubeGenerationLog,
        )
        await conn.run_sync(Base.metadata.create_all)

        # Lightweight column migrations for SQLite (create_all won't add
        # new columns to existing tables).
        _migrations = [
            ("reward_redemptions", "fulfilled_by", "INTEGER REFERENCES users(id)"),
            ("reward_redemptions", "fulfilled_at", "DATETIME"),
            # v2 feature columns
            ("users", "streak_freezes_used", "INTEGER DEFAULT 0"),
            ("users", "streak_freeze_month", "INTEGER"),
            ("chore_assignments", "feedback", "TEXT"),
            ("rewards", "category", "VARCHAR(50)"),
            ("chores", "thumbnail_url", "VARCHAR(500)"),
            ("rewards", "thumbnail_url", "VARCHAR(500)"),
            ("achievements", "tier", "VARCHAR(10)"),
            ("achievements", "group_key", "VARCHAR(50)"),
            ("achievements", "sort_order", "INTEGER DEFAULT 0"),
            ("exam_attempts", "is_locked", "BOOLEAN DEFAULT 1"),
            ("exam_attempts", "retry_requested", "BOOLEAN DEFAULT 0"),
            ("exam_attempts", "retry_approved", "BOOLEAN DEFAULT 0"),
            ("exam_tests", "thumbnail_url", "VARCHAR(500)"),
            ("exam_tests", "is_published", "BOOLEAN DEFAULT 1"),
        ]
        for table, col, typedef in _migrations:
            try:
                await conn.exec_driver_sql(
                    f"ALTER TABLE {table} ADD COLUMN {col} {typedef}"
                )
            except Exception:
                pass  # column already exists


async def get_db():
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()
