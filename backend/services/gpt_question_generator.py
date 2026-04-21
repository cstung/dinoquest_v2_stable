import json
import logging
from typing import Any

import openai
from openai import AsyncOpenAI

import backend.config as config

logger = logging.getLogger(__name__)

DEFAULT_MODEL = config.settings.OPENAI_MODEL
_openai_client: AsyncOpenAI | None = None


async def generate_questions(
    subtitle_text: str,
    video_title: str,
    thumbnail_url: str,
    n_questions: int,
    difficulty: str = "medium",
) -> list[dict]:
    """
    Generate normalized quiz questions from a video transcript.
    """
    if not subtitle_text.strip():
        raise ValueError("Transcript text is empty")

    client = _get_openai_client()
    system_prompt = _build_system_prompt(
        n_questions=n_questions,
        difficulty=difficulty,
        thumbnail_url=thumbnail_url,
    )
    user_prompt = (
        f"Video title: {video_title}\n\n"
        f"Transcript:\n{subtitle_text}\n\n"
        f"Generate exactly {n_questions} questions."
    )

    last_error: Exception | None = None
    for strict in (False, True):
        try:
            raw = await _call_gpt(
                client=client,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                n_questions=n_questions,
                strict=strict,
            )
            data = json.loads(raw)
            questions = _extract_questions(data)
            normalized_questions = normalize_questions(
                questions,
                thumbnail_url=thumbnail_url,
                expected_count=n_questions,
            )
            if len(normalized_questions) != n_questions:
                raise ValueError(
                    f"Expected {n_questions} valid questions, received {len(normalized_questions)}"
                )
            return normalized_questions
        except (json.JSONDecodeError, ValueError, openai.APIError) as exc:
            last_error = exc
            logger.warning(
                "GPT question generation attempt failed (strict=%s): %s",
                strict,
                exc,
            )

    raise ValueError(f"GPT failed to return a valid quiz: {last_error}")


def normalize_questions(
    questions: list[Any],
    thumbnail_url: str,
    expected_count: int | None = None,
) -> list[dict]:
    """
    Normalize AI or user-edited question payloads into the shape expected by persistence.
    """
    normalized_questions: list[dict] = []

    for raw_question in questions:
        if not isinstance(raw_question, dict):
            continue

        question_text = _clean_text(raw_question.get("question_text"))
        if not question_text:
            continue

        raw_options = raw_question.get("options")
        if not isinstance(raw_options, list):
            continue

        options: list[dict] = []
        seen_option_texts: set[str] = set()
        for raw_option in raw_options:
            if not isinstance(raw_option, dict):
                continue
            option_text = _clean_text(raw_option.get("option_text"))
            if not option_text:
                continue
            option_key = option_text.casefold()
            if option_key in seen_option_texts:
                continue
            seen_option_texts.add(option_key)
            index = len(options)
            options.append(
                {
                    "option_text": option_text,
                    "is_correct": bool(raw_option.get("is_correct")),
                    "sort_order": index,
                }
            )
            if len(options) == 4:
                break

        if len(options) != 4:
            continue

        allow_multiple = bool(raw_question.get("allow_multiple", False))
        correct_indexes = [i for i, option in enumerate(options) if option["is_correct"]]
        if not correct_indexes:
            continue
        if not allow_multiple and len(correct_indexes) > 1:
            first_correct = correct_indexes[0]
            for index, option in enumerate(options):
                option["is_correct"] = index == first_correct

        weight = _coerce_weight(raw_question.get("weight"))
        media_url = _clean_text(raw_question.get("media_url")) or thumbnail_url or None
        media_type = "image" if media_url else "none"
        explanation = _clean_text(raw_question.get("explanation")) or None

        normalized_questions.append(
            {
                "question_text": question_text,
                "media_type": media_type,
                "media_url": media_url,
                "explanation": explanation,
                "weight": weight,
                "allow_multiple": allow_multiple,
                "options": options,
            }
        )

    if expected_count is not None and len(normalized_questions) > expected_count:
        return normalized_questions[:expected_count]
    return normalized_questions


def _get_openai_client() -> AsyncOpenAI:
    global _openai_client
    if _openai_client is None:
        _openai_client = AsyncOpenAI(api_key=config.settings.OPENAI_API_KEY)
    return _openai_client


def _build_system_prompt(n_questions: int, difficulty: str, thumbnail_url: str) -> str:
    return f"""You create child-friendly quiz questions for DinoQuest.
Generate exactly {n_questions} multiple-choice questions from the transcript.

Rules:
- Target age: 7 years old.
- Difficulty: {difficulty}.
- Keep the wording simple, friendly, and concrete.
- Mix factual recall, comparisons, and cause/effect questions.
- Each question must have exactly 4 answer options.
- Only one answer should be correct unless the transcript clearly requires multiple answers.
- Use only facts supported by the transcript.
- Avoid trick wording, negativity, unsafe topics, and duplicate questions.
- Weight should be an integer from 1 to 5.

Return only JSON in this shape:
{{
  "questions": [
    {{
      "question_text": "string",
      "media_type": "image",
      "media_url": "{thumbnail_url}",
      "weight": 1,
      "allow_multiple": false,
      "explanation": "short optional explanation",
      "options": [
        {{"option_text": "string", "is_correct": true, "sort_order": 0}},
        {{"option_text": "string", "is_correct": false, "sort_order": 1}},
        {{"option_text": "string", "is_correct": false, "sort_order": 2}},
        {{"option_text": "string", "is_correct": false, "sort_order": 3}}
      ]
    }}
  ]
}}"""


async def _call_gpt(
    client: AsyncOpenAI,
    system_prompt: str,
    user_prompt: str,
    n_questions: int,
    strict: bool,
) -> str:
    strict_suffix = (
        "\nIMPORTANT: Return valid JSON with exactly one top-level key named 'questions'."
        if strict
        else ""
    )
    logger.info("Starting OpenAI request (model=%s, questions=%d)", DEFAULT_MODEL, n_questions)

    response = await client.chat.completions.create(
        model=DEFAULT_MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt + strict_suffix},
        ],
        response_format={"type": "json_object"},
        temperature=0.3,
        max_tokens=3500,
        timeout=60.0,
    )

    usage = getattr(response, "usage", None)
    if usage is not None:
        logger.info(
            "OpenAI response received. Tokens: prompt=%s, completion=%s",
            getattr(usage, "prompt_tokens", "n/a"),
            getattr(usage, "completion_tokens", "n/a"),
        )

    content = response.choices[0].message.content
    if not content:
        raise ValueError("OpenAI returned an empty response")
    return content


def _extract_questions(data: Any) -> list[Any]:
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        questions = data.get("questions", data.get("items", []))
        if not questions and len(data) == 1:
            candidate = next(iter(data.values()))
            if isinstance(candidate, list):
                return candidate
        if isinstance(questions, list):
            return questions
    raise ValueError("GPT returned an invalid question payload")


def _clean_text(value: Any) -> str:
    if value is None:
        return ""
    return " ".join(str(value).split()).strip()


def _coerce_weight(value: Any) -> int:
    try:
        weight = int(value)
    except (TypeError, ValueError):
        return 1
    return max(1, min(weight, 5))
