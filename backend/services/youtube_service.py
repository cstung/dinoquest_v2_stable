import html
import asyncio
import logging
import re
from pathlib import Path
from typing import Any

import httpx
from youtube_transcript_api import YouTubeTranscriptApi

try:
    from youtube_transcript_api import (
        CouldNotRetrieveTranscript,
        NoTranscriptFound,
        TranscriptsDisabled,
        VideoUnavailable,
    )
except ImportError:
    from youtube_transcript_api._errors import (  # type: ignore[attr-defined]
        CouldNotRetrieveTranscript,
        NoTranscriptFound,
        TranscriptsDisabled,
        VideoUnavailable,
    )

logger = logging.getLogger(__name__)

PREFERRED_LANGUAGES = ("en", "en-US", "en-GB", "en_US", "en_GB", "vi")
TRANSCRIPT_CHAR_LIMIT = 12000
YOUTUBE_ID_RE = re.compile(
    r"(?:v=|youtu\.be/|embed/|shorts/)([A-Za-z0-9_-]{11})"
)
HTML_TAG_RE = re.compile(r"<[^>]+>")
TIMESTAMP_RE = re.compile(
    r"^\d{2}:\d{2}:\d{2}\.\d{3}\s+-->\s+\d{2}:\d{2}:\d{2}\.\d{3}"
)

class TranscriptUnavailableError(RuntimeError):
    """Raised when a video has no accessible transcript."""


class TranscriptFetchError(RuntimeError):
    """Raised when transcript retrieval fails for non-content reasons."""


TRANSCRIPT_EXCEPTIONS = (
    NoTranscriptFound,
    TranscriptsDisabled,
    CouldNotRetrieveTranscript,
    VideoUnavailable,
    TranscriptUnavailableError,
)


def _oembed_timeout() -> httpx.Timeout:
    # Some environments block/slow YouTube; keep connect time tight so UI doesn't hang.
    import backend.config as config
    seconds = float(getattr(config.settings, "YOUTUBE_OEMBED_TIMEOUT_SECONDS", 10.0))
    return httpx.Timeout(connect=seconds, read=seconds, write=seconds, pool=seconds)


def _transcript_timeout_seconds() -> float:
    import backend.config as config
    return float(getattr(config.settings, "YOUTUBE_TRANSCRIPT_TIMEOUT_SECONDS", 20.0))


def _transcript_max_concurrency() -> int:
    import backend.config as config
    value = int(getattr(config.settings, "YOUTUBE_TRANSCRIPT_MAX_CONCURRENCY", 4))
    return max(1, min(value, 32))


_transcript_semaphore = asyncio.Semaphore(_transcript_max_concurrency())


async def get_video_data(youtube_url: str) -> dict:
    """
    Extracts YouTube metadata and transcript text without downloading media files.
    """
    video_id = _extract_video_id(youtube_url)
    video_title = "Unknown Video"
    thumbnail_url = f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg"

    try:
        async with httpx.AsyncClient(timeout=_oembed_timeout(), follow_redirects=True) as client:
            oembed_url = (
                "https://www.youtube.com/oembed"
                f"?url=https://www.youtube.com/watch?v={video_id}&format=json"
            )
            response = await client.get(oembed_url)
            response.raise_for_status()
            data = response.json()
            video_title = data.get("title", video_title)
            thumbnail_url = data.get("thumbnail_url", thumbnail_url)
    except Exception as exc:
        logger.warning(
            "OEmbed metadata fetch failed for %s (%s): %s. Using defaults.",
            video_id,
            type(exc).__name__,
            exc,
        )

    subtitle_text = ""
    subtitle_available = False
    subtitle_error: str | None = None

    logger.info("Fetching transcript for video_id=%s", video_id)
    try:
        # youtube-transcript-api is synchronous and can block indefinitely on network issues.
        # Offload to a thread and enforce an overall timeout so the request doesn't hang.
        async with _transcript_semaphore:
            transcript_data = await asyncio.wait_for(
                asyncio.to_thread(_fetch_transcript, video_id),
                timeout=_transcript_timeout_seconds(),
            )
        subtitle_text = _transcript_to_text(transcript_data)
        subtitle_available = bool(subtitle_text)
        if subtitle_available:
            logger.info("Transcript fetched for %s (%d chars)", video_id, len(subtitle_text))
        else:
            subtitle_error = "unavailable"
    except TRANSCRIPT_EXCEPTIONS as exc:
        logger.warning("No usable transcript for %s: %s", video_id, exc)
        subtitle_error = "unavailable"
    except asyncio.TimeoutError:
        logger.warning("Transcript fetch timeout for %s", video_id)
        subtitle_error = "timeout"
    except Exception as exc:
        logger.error(
            "Unexpected transcript error for %s (%s): %s",
            video_id,
            type(exc).__name__,
            exc,
        )
        subtitle_error = "error"

    if subtitle_available and len(subtitle_text) > TRANSCRIPT_CHAR_LIMIT:
        subtitle_text = _truncate_text(subtitle_text, TRANSCRIPT_CHAR_LIMIT)
        logger.info("Transcript truncated to %d chars", TRANSCRIPT_CHAR_LIMIT)

    return {
        "video_id": video_id,
        "video_title": video_title,
        "thumbnail_url": thumbnail_url,
        "subtitle_text": subtitle_text,
        "subtitle_available": subtitle_available,
        "subtitle_error": subtitle_error if not subtitle_available else None,
    }


def _fetch_transcript(video_id: str) -> Any:
    api = _build_transcript_api()
    direct_error: Exception | None = None
    try:
        direct_fetch = _call_transcript_method(
            api,
            ("get_transcript", "fetch"),
            video_id,
            languages=list(PREFERRED_LANGUAGES),
        )
    except TRANSCRIPT_EXCEPTIONS as exc:
        direct_error = exc
        direct_fetch = None
        logger.info(
            "Direct transcript fetch failed for %s (%s); trying transcript discovery",
            video_id,
            type(exc).__name__,
        )
    if direct_fetch is not None:
        return direct_fetch

    transcript_listing = _call_transcript_method(api, ("list_transcripts",), video_id)
    if transcript_listing is None:
        if direct_error is not None:
            raise direct_error
        raise RuntimeError("youtube-transcript-api does not expose a transcript listing method")

    transcript = _select_best_transcript(list(transcript_listing))
    if transcript is None:
        raise TranscriptUnavailableError("No transcripts were returned for this video")

    return transcript.fetch()


def _build_transcript_api() -> Any:
    try:
        return YouTubeTranscriptApi()
    except TypeError:
        return YouTubeTranscriptApi


def _call_transcript_method(
    api: Any,
    method_names: tuple[str, ...],
    video_id: str,
    **kwargs: Any,
) -> Any | None:
    for method_name in method_names:
        method = getattr(api, method_name, None)
        if not callable(method):
            continue
        try:
            return method(video_id, **kwargs)
        except TypeError:
            filtered_kwargs = {}
            if method_name == "get_transcript":
                filtered_kwargs["languages"] = kwargs.get("languages")
            return method(video_id, **filtered_kwargs)
        except TRANSCRIPT_EXCEPTIONS:
            raise
        except Exception as exc:
            logger.debug(
                "Transcript method %s failed for %s (%s): %s",
                method_name,
                video_id,
                type(exc).__name__,
                exc,
            )
    return None


def _select_best_transcript(transcripts: list[Any]) -> Any | None:
    if not transcripts:
        return None

    def preference_key(transcript: Any) -> tuple[int, int]:
        language_code = getattr(transcript, "language_code", "") or ""
        generated_rank = 1 if getattr(transcript, "is_generated", False) else 0
        try:
            language_rank = PREFERRED_LANGUAGES.index(language_code)
        except ValueError:
            language_rank = len(PREFERRED_LANGUAGES)
        return (generated_rank, language_rank)

    return min(transcripts, key=preference_key)


def _transcript_to_text(transcript_data: Any) -> str:
    raw_items = _coerce_transcript_items(transcript_data)
    cleaned_parts: list[str] = []
    previous_line = ""

    for item in raw_items:
        if isinstance(item, dict):
            text = item.get("text", "")
        else:
            text = getattr(item, "text", "")

        cleaned = _clean_subtitle_text(str(text))
        if not cleaned:
            continue

        dedupe_key = cleaned.casefold()
        if cleaned.startswith("[") and cleaned.endswith("]"):
            continue
        if dedupe_key == previous_line:
            continue

        previous_line = dedupe_key
        cleaned_parts.append(cleaned)

    return " ".join(cleaned_parts).strip()


def _coerce_transcript_items(transcript_data: Any) -> list[Any]:
    if transcript_data is None:
        return []
    if hasattr(transcript_data, "to_raw_data"):
        return list(transcript_data.to_raw_data())
    if isinstance(transcript_data, list):
        return transcript_data
    try:
        return list(transcript_data)
    except TypeError:
        return []


def _clean_subtitle_text(text: str) -> str:
    cleaned = html.unescape(text)
    cleaned = HTML_TAG_RE.sub("", cleaned)
    cleaned = cleaned.replace("\n", " ")
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned.strip()


def _truncate_text(text: str, max_length: int) -> str:
    if len(text) <= max_length:
        return text
    truncated = text[:max_length].rsplit(" ", 1)[0].strip()
    if not truncated:
        truncated = text[:max_length].strip()
    return truncated + "\n[transcript truncated]"


def _extract_video_id(url: str) -> str:
    """Extract the 11-character YouTube video id from a supported URL."""
    match = YOUTUBE_ID_RE.search(url)
    if match:
        return match.group(1)
    raise ValueError("Invalid YouTube URL format")


def _parse_vtt(path: str) -> str:
    """
    Legacy helper retained for unit tests and emergency local subtitle parsing.
    """
    lines = Path(path).read_text(encoding="utf-8").splitlines()
    content_lines: list[str] = []

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        if stripped in {"WEBVTT", "Kind: captions"} or stripped.startswith("Language:"):
            continue
        if stripped.isdigit() or TIMESTAMP_RE.match(stripped):
            continue
        content_lines.append(stripped)

    return _transcript_to_text([{"text": line} for line in content_lines])
