import os
import json
import logging
from openai import AsyncOpenAI
import openai

logger = logging.getLogger(__name__)

async def generate_questions(
    subtitle_text: str,
    video_title: str,
    thumbnail_url: str,
    n_questions: int,
    difficulty: str = "medium"
) -> list[dict]:
    """
    Generates educational questions using OpenAI's GPT-4o.
    """
    client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    
    system_prompt = f"""You are an educational content creator for children aged 7 years old.
    Based on the following video transcript, generate exactly {n_questions} multiple-choice questions for a gamified app called DinoQuest.

    Rules for Question Design:
    - Questions should be tricky but logical/verbal test appropriate for 7-year-old children.
    - Mix cause-and-effect reasoning, factual recall, "which is NOT", and comparison questions.
    - Each question has exactly 4 answer options.
    - Only ONE option should be correct (is_correct: true), the rest false.
    - Use simple, friendly, and clear language.
    - Weight reflects difficulty: easy=1, medium=2, hard=3-5.

    Return ONLY a JSON object with a "questions" key containing the array of questions. 
    Strictly follow this structure: 
    {{
      "questions": [
        {{
          "question_text": "string",
          "media_type": "image",
          "media_url": "{thumbnail_url}",
          "weight": <int 1-5>,
          "allow_multiple": false,
          "options": [
            {{"option_text": "string", "is_correct": true, "sort_order": 0}},
            {{"option_text": "string", "is_correct": false, "sort_order": 1}},
            {{"option_text": "string", "is_correct": false, "sort_order": 2}},
            {{"option_text": "string", "is_correct": false, "sort_order": 3}}
          ]
        }}
      ]
    }}"""

    user_prompt = f"Video title: {video_title}\n\nTranscript:\n{subtitle_text}\n\nGenerate {n_questions} tricky but logical questions for a 7-year-old."

    async def call_gpt(strict=False):
        prompt_suffix = "\nIMPORTANT: Ensure the output is valid JSON and contains exactly the 'questions' key." if strict else ""
        logger.info("Starting OpenAI request (model=%s, questions=%d)", os.getenv("OPENAI_MODEL", "gpt-4o"), n_questions)
        
        response = await client.chat.completions.create(
            model=os.getenv("OPENAI_MODEL", "gpt-4o"),
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt + prompt_suffix}
            ],
            response_format={"type": "json_object"},
            temperature=0.7,
            max_tokens=4000,
            timeout=60.0, # 60s timeout to prevent hanging the whole server
        )
        logger.info("OpenAI response received. Tokens: prompt=%d, completion=%d", 
                    response.usage.prompt_tokens, response.usage.completion_tokens)
        return response.choices[0].message.content

    try:
        raw = await call_gpt()
        data = json.loads(raw)
    except (json.JSONDecodeError, openai.APIError) as e:
        logger.warning("First GPT attempt failed: %s. Retrying...", str(e))
        try:
            raw = await call_gpt(strict=True)
            data = json.loads(raw)
        except Exception as e2:
            logger.error("Second GPT attempt failed: %s", str(e2))
            raise ValueError(f"GPT failed to return valid JSON after 2 attempts: {str(e2)}")

    # Extract questions list
    if isinstance(data, list):
        questions = data
    else:
        # Check for common wrapping keys
        questions = data.get("questions", data.get("items", []))
        if not questions and len(data) == 1:
            # If there's only one key and it contains a list, use it
            val = next(iter(data.values()))
            if isinstance(val, list):
                questions = val

    if not questions:
        raise ValueError("GPT returned an empty question list")

    # Validation
    validated_questions = []
    for q in questions:
        try:
            if not q.get("question_text"): continue
            options = q.get("options", [])
            if len(options) != 4: continue
            if not any(o.get("is_correct") for o in options): continue
            
            # Ensure media is set correctly
            q["media_type"] = "image"
            q["media_url"] = thumbnail_url
            
            validated_questions.append(q)
        except Exception:
            continue

    return validated_questions
