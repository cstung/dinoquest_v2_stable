import asyncio
import json
from unittest.mock import AsyncMock, patch
from backend.services.gpt_question_generator import generate_questions

async def test_gpt_generator():
    mock_response = {
        "questions": [
            {
                "question_text": "What is 2+2?",
                "weight": 1,
                "allow_multiple": False,
                "options": [
                    {"option_text": "4", "is_correct": True, "sort_order": 0},
                    {"option_text": "5", "is_correct": False, "sort_order": 1},
                    {"option_text": "3", "is_correct": False, "sort_order": 2},
                    {"option_text": "6", "is_correct": False, "sort_order": 3}
                ]
            }
        ]
    }
    
    with patch("openai.resources.chat.completions.AsyncCompletions.create", new_callable=AsyncMock) as mock_create:
        mock_create.return_value.choices[0].message.content = json.dumps(mock_response)
        
        questions = await generate_questions(
            subtitle_text="Some text",
            video_title="Test Video",
            thumbnail_url="http://thumb",
            n_questions=1
        )
        
        assert len(questions) == 1
        assert questions[0]["question_text"] == "What is 2+2?"
        assert questions[0]["media_url"] == "http://thumb"
        print("GPT GENERATOR MOCK PASS")

if __name__ == "__main__":
    asyncio.run(test_gpt_generator())
