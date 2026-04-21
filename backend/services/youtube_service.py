import re
import os
import tempfile
import logging
import asyncio
from pathlib import Path
import yt_dlp

logger = logging.getLogger(__name__)

async def get_video_data(youtube_url: str) -> dict:
    """
    Extracts metadata and subtitles from a YouTube video URL.
    Returns:
    {
        "video_id": str,
        "video_title": str,
        "thumbnail_url": str,
        "subtitle_text": str,
        "subtitle_available": bool
    }
    """
    # 1. Extract video_id from URL
    regex = r"(?:https?://)?(?:www\.)?(?:youtube\.com/watch\?v=|youtu\.be/)([\w-]+)"
    match = re.search(regex, youtube_url)
    if not match:
        raise ValueError("Invalid YouTube URL format")
    
    video_id = match.group(1)
    
    # 2. Thumbnail URL (Construct directly)
    thumbnail_url = f"https://img.youtube.com/vi/{video_id}/maxresdefault.jpg"
    
    # Create a temp directory for subtitles
    with tempfile.TemporaryDirectory() as tmpdir:
        # 3. Subtitle download via yt-dlp
        ydl_opts = {
            "skip_download": True,
            "writeautomaticsub": True,
            "writesubtitles": True,
            "subtitleslangs": ["en", "vi"],
            "subtitlesformat": "vtt",
            "outtmpl": os.path.join(tmpdir, "%(id)s.%(ext)s"),
            "quiet": True,
            "no_warnings": True,
        }
        
        try:
            # yt-dlp is mostly synchronous in its extract_info call
            # We run it in a thread to keep the event loop free
            loop = asyncio.get_event_loop()
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                logger.info("Extracting YouTube info for: %s", youtube_url)
                info = await loop.run_in_executor(None, lambda: ydl.extract_info(youtube_url, download=True))
                video_title = info.get("title", "Unknown Video")
                logger.info("YouTube metadata fetched: %s", video_title)
            
            # Find the subtitle file
            vtt_file = None
            for f in os.listdir(tmpdir):
                if f.endswith(".vtt"):
                    vtt_file = os.path.join(tmpdir, f)
                    break
            
            if not vtt_file:
                return {
                    "video_id": video_id,
                    "video_title": video_title,
                    "thumbnail_url": thumbnail_url,
                    "subtitle_text": "",
                    "subtitle_available": False
                }
            
            # 4. Parse .vtt to plain text
            subtitle_text = _parse_vtt(vtt_file)
            logger.info("Raw subtitles extracted: %d chars", len(subtitle_text))
            
            # 5. Truncate to 12,000 characters
            if len(subtitle_text) > 12000:
                subtitle_text = subtitle_text[:12000] + "\n[transcript truncated at 12,000 characters]"
                logger.info("Subtitles truncated to 12,000 chars for AI efficiency")
            
            return {
                "video_id": video_id,
                "video_title": video_title,
                "thumbnail_url": thumbnail_url,
                "subtitle_text": subtitle_text,
                "subtitle_available": True
            }

        except Exception as e:
            logger.error("yt-dlp failed: %s", str(e))
            if "not available" in str(e).lower() or "private" in str(e).lower():
                raise ValueError(f"Video unavailable: {str(e)}")
            raise RuntimeError(f"yt-dlp failed unexpectedly: {str(e)}")

def _parse_vtt(filepath: str) -> str:
    """Helper to strip VTT markup and timestamps."""
    content = []
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()
        
    for line in lines:
        line = line.strip()
        # Skip header lines
        if line.startswith(("WEBVTT", "Kind:", "Language:", "00:")):
            continue
        # Skip timestamp lines (alternative format)
        if "-->" in line:
            continue
        # Skip numeric cue identifiers
        if line.isdigit():
            continue
        if not line:
            continue
            
        # Basic cleaning of multiple spaces/duplicates (common in auto-subs)
        # Duplicate removal logic for auto-generated subs
        if content and content[-1] == line:
            continue
            
        content.append(line)
    
    # Join and collapse multiple spaces
    text = " ".join(content)
    return re.sub(r'\s+', ' ', text).strip()

if __name__ == "__main__":
    # Internal verification test
    async def test():
        try:
            res = await get_video_data("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
            print("Video Title:", res["video_title"])
            print("Subtitle Available:", res["subtitle_available"])
            print("Snippet:", res["subtitle_text"][:100] + "...")
        except Exception as e:
            print("TEST FAILED:", e)

    asyncio.run(test())
