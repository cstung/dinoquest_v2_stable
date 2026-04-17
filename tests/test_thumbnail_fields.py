import unittest
from datetime import datetime
import os

from pydantic import ValidationError

os.environ.setdefault("SECRET_KEY", "unit-test-secret-key")

from backend.models import Chore, Reward, Difficulty, Recurrence
from backend.schemas import (
    ChoreCreate,
    ChoreUpdate,
    ChoreResponse,
    RewardCreate,
    RewardUpdate,
    RewardResponse,
)


class ThumbnailSchemaTests(unittest.TestCase):
    def test_chore_schemas_accept_thumbnail_url(self):
        create = ChoreCreate(
            title="Clean room",
            description="Clean it well",
            points=10,
            difficulty=Difficulty.easy,
            icon="sparkles",
            thumbnail_url="/api/uploads/chore.png",
            category_id=1,
            recurrence=Recurrence.once,
            assigned_user_ids=[],
        )
        self.assertEqual(create.thumbnail_url, "/api/uploads/chore.png")

        update = ChoreUpdate(thumbnail_url="/api/uploads/chore2.png")
        self.assertEqual(update.thumbnail_url, "/api/uploads/chore2.png")

        response = ChoreResponse(
            id=1,
            title="Clean room",
            description=None,
            points=10,
            difficulty=Difficulty.easy,
            icon=None,
            thumbnail_url="/api/uploads/chore.png",
            category_id=1,
            recurrence=Recurrence.once,
            custom_days=None,
            requires_photo=False,
            is_active=True,
            created_by=1,
            created_at=datetime.utcnow(),
        )
        self.assertEqual(response.thumbnail_url, "/api/uploads/chore.png")

    def test_reward_schemas_accept_thumbnail_url(self):
        create = RewardCreate(
            title="Movie night",
            description="Pick a movie",
            point_cost=50,
            icon="gift",
            thumbnail_url="/api/uploads/reward.png",
        )
        self.assertEqual(create.thumbnail_url, "/api/uploads/reward.png")

        update = RewardUpdate(thumbnail_url="/api/uploads/reward2.png")
        self.assertEqual(update.thumbnail_url, "/api/uploads/reward2.png")

        response = RewardResponse(
            id=1,
            title="Movie night",
            description=None,
            point_cost=50,
            icon=None,
            thumbnail_url="/api/uploads/reward.png",
            category=None,
            stock=None,
            auto_approve_threshold=None,
            is_active=True,
            created_by=1,
            created_at=datetime.utcnow(),
        )
        self.assertEqual(response.thumbnail_url, "/api/uploads/reward.png")

    def test_thumbnail_url_requires_string_or_none(self):
        with self.assertRaises(ValidationError):
            ChoreCreate(
                title="Laundry",
                points=10,
                difficulty=Difficulty.easy,
                category_id=1,
                recurrence=Recurrence.once,
                thumbnail_url=123,
            )

        with self.assertRaises(ValidationError):
            RewardCreate(
                title="Toy",
                point_cost=20,
                thumbnail_url=123,
            )


class ThumbnailModelTests(unittest.TestCase):
    def test_models_define_thumbnail_columns(self):
        self.assertIn("thumbnail_url", Chore.__table__.columns)
        self.assertIn("thumbnail_url", Reward.__table__.columns)
        self.assertEqual(Chore.__table__.columns["thumbnail_url"].type.length, 500)
        self.assertEqual(Reward.__table__.columns["thumbnail_url"].type.length, 500)


if __name__ == "__main__":
    unittest.main()
