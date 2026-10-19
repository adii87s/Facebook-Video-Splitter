from pathlib import Path

from app.services.video_processor import build_segments, get_duration


def test_segments_are_max_one_minute():
    segments = build_segments(185.0)
    assert [duration for _, duration in segments] == [60.0, 60.0, 60.0, 5.0]
    assert all(duration <= 60 for _, duration in segments)


def test_tiny_final_tail_is_moved_to_four_seconds():
    segments = build_segments(121.5)
    assert segments == [(0.0, 60.0), (60.0, 57.5), (117.5, 4.0)]


def test_short_source_stays_short_for_preview():
    assert build_segments(2.5) == [(0.0, 2.5)]


def test_get_duration_rejects_invalid_video(tmp_path: Path):
    fake_video = tmp_path / "not-a-video.mp4"
    fake_video.write_text("not a video", encoding="utf-8")
    try:
        get_duration(fake_video)
    except Exception as exc:
        assert "duration" in str(exc).lower() or "ffmpeg" in str(exc).lower() or "invalid" in str(exc).lower()
    else:
        raise AssertionError("Expected FFprobe to reject an invalid video")
