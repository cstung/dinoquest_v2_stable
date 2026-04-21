import asyncio
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from backend.services.gpt_question_generator import generate_questions, normalize_questions


def test_normalize_questions_repairs_single_select():
    normalized = normalize_questions(
        [
            {
                "question_text": "What is 2 + 2?",
                "weight": "9",
                "allow_multiple": False,
                "options": [
                    {"option_text": "4", "is_correct": True},
                    {"option_text": "5", "is_correct": True},
                    {"option_text": "3", "is_correct": False},
                    {"option_text": "6", "is_correct": False},
                ],
            }
        ],
        thumbnail_url="http://thumb",
        expected_count=1,
    )

    assert len(normalized) == 1
    assert normalized[0]["weight"] == 5
    assert sum(option["is_correct"] for option in normalized[0]["options"]) == 1
    assert normalized[0]["media_url"] == "http://thumb"


async def test_gpt_generator():
    mock_payload = {
        "questions": [
            {
                "question_text": "What is 2+2?",
                "weight": 1,
                "allow_multiple": False,
                "options": [
                    {"option_text": "4", "is_correct": True},
                    {"option_text": "5", "is_correct": False},
                    {"option_text": "3", "is_correct": False},
                    {"option_text": "6", "is_correct": False},
                ],
            }
        ]
    }

    mock_response = SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=json.dumps(mock_payload)))],
        usage=SimpleNamespace(prompt_tokens=10, completion_tokens=20),
    )
    mock_client = SimpleNamespace(
        chat=SimpleNamespace(
            completions=SimpleNamespace(create=AsyncMock(return_value=mock_response))
        )
    )

    with patch(
        "backend.services.gpt_question_generator._get_openai_client",
        return_value=mock_client,
    ):
        questions = await generate_questions(
            subtitle_text="Some text",
            video_title="Test Video",
            thumbnail_url="http://thumb",
            n_questions=1,
        )

    assert len(questions) == 1
    assert questions[0]["question_text"] == "What is 2+2?"
    assert questions[0]["media_url"] == "http://thumb"
    print("GPT GENERATOR MOCK PASS")


if __name__ == "__main__":
    test_normalize_questions_repairs_single_select()
    asyncio.run(test_gpt_generator())
