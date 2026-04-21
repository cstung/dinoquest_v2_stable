import os
import tempfile
from backend.services.youtube_service import _parse_vtt

def test_vtt_parsing():
    vtt_content = """WEBVTT
Kind: captions
Language: en

00:00:00.000 --> 00:00:02.000
Hello world

1
00:00:02.000 --> 00:00:04.000
This is a test.

2
00:00:04.000 --> 00:00:06.000
This is a test.
"""
    with tempfile.NamedTemporaryFile(mode='w', suffix='.vtt', delete=False, encoding='utf-8') as f:
        f.write(vtt_content)
        name = f.name
        
    try:
        parsed = _parse_vtt(name)
        print(f"Parsed: '{parsed}'")
        assert parsed == "Hello world This is a test."
        print("VTT PARSING PASS")
    finally:
        os.unlink(name)

if __name__ == "__main__":
    test_vtt_parsing()
