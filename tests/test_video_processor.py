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



def test_custom_clip_length_keeps_all_source_seconds():
    segments = build_segments(185.0, clip_seconds=30)
    assert all(duration <= 30 for _, duration in segments)
    assert sum(duration for _, duration in segments) == 185.0
    assert len(segments) == 7


def test_short_final_part_is_adjusted_for_custom_split_length():
    segments = build_segments(62.0, clip_seconds=15)
    assert segments[-1][1] == 4.0
    assert sum(duration for _, duration in segments) == 62.0


def test_manual_cut_uses_requested_start_and_duration(monkeypatch, tmp_path: Path):
    import subprocess

    import app.services.video_processor as processor

    source = tmp_path / "source.mp4"
    source.write_bytes(b"source placeholder")
    seen_commands = []

    monkeypatch.setattr(processor, "get_duration", lambda _path: 120.0)
    monkeypatch.setattr(processor, "_badge_image", lambda path, _label: path.write_bytes(b"badge"))

    def fake_run(command):
        seen_commands.append(command)
        return subprocess.CompletedProcess(command, 0, "", "")

    monkeypatch.setattr(processor, "_run", fake_run)
    clips = processor.cut_video(
        source,
        tmp_path / "output",
        start_seconds=12.5,
        end_seconds=24.0,
    )

    assert len(clips) == 1
    assert clips[0]["start_seconds"] == 12.5
    assert clips[0]["duration"] == 11.5
    assert "12.500" in seen_commands[0]
    assert "11.500" in seen_commands[0]
