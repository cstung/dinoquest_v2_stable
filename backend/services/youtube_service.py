import re
import logging
import httpx
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import NoTranscriptFound, TranscriptsDisabled

logger = logging.getLogger(__name__)

async def get_video_data(youtube_url: str) -> dict:
    """
    Extracts metadata via OEmbed and subtitles via youtube-transcript-api.
    NO external binaries (yt-dlp/ffmpeg) required.
    """
    # 1. Extract video_id from URL
    video_id = _extract_video_id(youtube_url)
    
    # 2. Fetch Metadata via OEmbed (Fast & Reliable)
    # This avoids using yt-dlp which was hanging on the server
    video_title = "Unknown Video"
    thumbnail_url = f"https://img.youtube.com/vi/{video_id}/maxresdefault.jpg"
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            oembed_url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={video_id}&format=json"
            resp = await client.get(oembed_url)
            if resp.status_code == 200:
                data = resp.json()
                video_title = data.get("title", video_title)
                thumbnail_url = data.get("thumbnail_url", thumbnail_url)
    except Exception as e:
        logger.warning("OEmbed metadata fetch failed: %s. Using defaults.", str(e))

    # 3. Fetch Transcript
    subtitle_text = ""
    subtitle_available = False
    
    logger.info("Fetching transcript for video_id: %s", video_id)
    try:
        # Try specific languages first
        try:
            transcript_list = YouTubeTranscriptApi.get_transcript(
                video_id, languages=["en", "vi", "en-US", "en-GB"]
            )
            subtitle_text = " ".join(t["text"] for t in transcript_list)
            subtitle_available = True
        except NoTranscriptFound:
            # Fallback: find ANY available transcript (including auto-generated)
            ts = YouTubeTranscriptApi.list_transcripts(video_id)
            transcript = ts.find_generated_transcript(["en", "vi", "en-US", "en-GB", "id", "ms"])
            transcript_list = transcript.fetch()
            subtitle_text = " ".join(t["text"] for t in transcript_list)
            subtitle_available = True
            
    except (NoTranscriptFound, TranscriptsDisabled) as e:
        logger.warning("No subtitles found or disabled for %s: %s", video_id, str(e))
    except Exception as e:
        logger.error("Unexpected transcript error for %s: %s", video_id, str(e))

    # 4. Truncate and Clean
    if subtitle_available:
        logger.info("Raw transcript fetched: %d chars", len(subtitle_text))
        if len(subtitle_text) > 12000:
            subtitle_text = subtitle_text[:12000] + "\n[transcript truncated at 12,000 characters]"
            logger.info("Transcript truncated to 12,000 chars for AI efficiency")
    
    return {
        "video_id": video_id,
        "video_title": video_title,
        "thumbnail_url": thumbnail_url,
        "subtitle_text": subtitle_text,
        "subtitle_available": subtitle_available
    }

def _extract_video_id(url: str) -> str:
    """Helper to extract the 11-char YouTube ID."""
    patterns = [
        r"(?:v=|youtu\.be/|embed/|shorts/)([a-zA-Z0-9_-]{11})",
    ]
    for pattern in patterns:
        m = re.search(pattern, url)
        if m:
            return m.group(1)
    raise ValueError("Invalid YouTube URL format")
