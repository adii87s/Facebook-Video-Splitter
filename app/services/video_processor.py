from __future__ import annotations

import json
import math
import subprocess
from pathlib import Path
from typing import Callable

from PIL import Image, ImageDraw, ImageFont

from app.config import CLIP_SECONDS, FFMPEG_PATH, FFPROBE_PATH

ProgressCallback = Callable[[int, int, Path, float], None]


class VideoProcessingError(RuntimeError):
    pass


def _run(command: list[str]) -> subprocess.CompletedProcess[str]:
    try:
        result = subprocess.run(command, capture_output=True, text=True, check=False)
    except FileNotFoundError as exc:
        raise VideoProcessingError(
            "FFmpeg or FFprobe was not found. Install FFmpeg and ensure ffmpeg.exe and ffprobe.exe are on PATH."
        ) from exc
    if result.returncode != 0:
        details = (result.stderr or result.stdout or "Unknown FFmpeg error")[-4000:]
        raise VideoProcessingError(details)
    return result


def get_duration(video_path: Path) -> float:
    result = _run([
        FFPROBE_PATH, "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", str(video_path),
    ])
    try:
        duration = float(result.stdout.strip())
    except ValueError as exc:
        raise VideoProcessingError("Could not read the duration of this video.") from exc
    if not math.isfinite(duration) or duration <= 0:
        raise VideoProcessingError("The uploaded video has no usable duration.")
    return duration


def build_segments(duration: float, clip_seconds: int = CLIP_SECONDS) -> list[tuple[float, float]]:
    """Create consecutive clips without changing the requested cut boundaries."""
    if duration <= 0 or clip_seconds <= 0:
        raise ValueError("Duration and clip length must be positive")
    total = math.ceil(duration / clip_seconds)
    return [
        (
            float(index * clip_seconds),
            min(float(clip_seconds), max(0.0, duration - index * clip_seconds)),
        )
        for index in range(total)
    ]

def _render_profile(processing_mode: str) -> dict[str, object]:
    """Return output dimensions and encoder settings for fast or high-quality rendering."""
    if processing_mode == "fast":
        return {"width": 720, "height": 1280, "preset": "ultrafast", "crf": "23", "blur": "12:6", "badge_offset": 24, "audio_bitrate": "96k"}
    if processing_mode == "quality":
        return {"width": 1080, "height": 1920, "preset": "veryfast", "crf": "22", "blur": "18:8", "badge_offset": 36, "audio_bitrate": "128k"}
    raise ValueError("Processing mode must be 'fast' or 'quality'.")


def _build_filter_graph(profile: dict[str, object]) -> str:
    width = int(profile["width"])
    height = int(profile["height"])
    blur = str(profile["blur"])
    badge_offset = int(profile["badge_offset"])
    return (
        "[0:v]split=2[foreground_source][background_source];"
        f"[background_source]scale={width}:{height}:force_original_aspect_ratio=increase,"
        f"crop={width}:{height},boxblur={blur}[background];"
        f"[foreground_source]scale={width}:{height}:force_original_aspect_ratio=decrease[foreground];"
        "[background][foreground]overlay=(W-w)/2:(H-h)/2,setsar=1,fps=30[base];"
        f"[base][1:v]overlay=W-w-{badge_offset}:{badge_offset},format=yuv420p[video]"
    )


def _badge_image(path: Path, label: str) -> None:
    font_size = 42
    try:
        font = ImageFont.truetype("arialbd.ttf", font_size)
    except OSError:
        try:
            font = ImageFont.truetype("DejaVuSans-Bold.ttf", font_size)
        except OSError:
            font = ImageFont.load_default()
    probe = Image.new("RGBA", (8, 8), (0, 0, 0, 0)
    )
    probe_draw = ImageDraw.Draw(probe)
    left, top, right, bottom = probe_draw.textbbox((0, 0), label, font=font, stroke_width=0)
    pad_x, pad_y = 28, 18
    width, height = right - left + 2 * pad_x, bottom - top + 2 * pad_y
    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((0, 0, width - 1, height - 1), radius=18, fill=(12, 16, 26, 225))
    draw.text((pad_x - left, pad_y - top), label, font=font, fill=(255, 255, 255, 255))
    image.save(path)


def split_video(
    source_path: Path,
    output_dir: Path,
    on_progress: ProgressCallback | None = None,
    clip_seconds: int = CLIP_SECONDS,
    processing_mode: str = "fast",
) -> list[dict[str, object]]:
    profile = _render_profile(processing_mode)
    filter_graph = _build_filter_graph(profile)
    duration = get_duration(source_path)
    segments = build_segments(duration, clip_seconds=clip_seconds)
    total = len(segments)
    output_dir.mkdir(parents=True, exist_ok=True)
    clips: list[dict[str, object]] = []

    for index, (start, clip_duration) in enumerate(segments):
        if clip_duration <= 0:
            continue
        part = index + 1
        filename = f"part-{part:03d}.mp4"
        output_path = output_dir / filename
        badge_path = output_dir / f".badge-{part:03d}.png"
        _badge_image(badge_path, f"PART {part}")

        # Center the original video over a blurred, filled 9:16 background. This
        # keeps landscape movies watchable instead of cropping away their sides.
        command = [
            FFMPEG_PATH, "-hide_banner", "-loglevel", "error", "-y",
            "-ss", f"{start:.3f}", "-i", str(source_path),
            "-loop", "1", "-framerate", "30", "-i", str(badge_path),
            "-t", f"{clip_duration:.3f}",
            "-filter_complex", filter_graph,
            "-map", "[video]", "-map", "0:a?",
            "-c:v", "libx264", "-preset", str(profile["preset"]), "-crf", str(profile["crf"]),
            "-c:a", "aac", "-b:a", str(profile["audio_bitrate"]), "-ar", "44100",
            "-r", "30", "-movflags", "+faststart", str(output_path),
        ]
        try:
            _run(command)
        finally:
            badge_path.unlink(missing_ok=True)
        clip = {
            "part": part,
            "filename": filename,
            "duration": round(clip_duration, 3),
            "start_seconds": start,
            "url": f"/api/jobs/CLIP_JOB_ID/clips/{filename}",
            "publish_status": "not_started",
        }
        clips.append(clip)
        if on_progress:
            on_progress(part, total, output_path, clip_duration)
    return clips

def cut_video(
    source_path: Path,
    output_dir: Path,
    start_seconds: float,
    end_seconds: float,
    on_progress: ProgressCallback | None = None,
    processing_mode: str = "fast",
) -> list[dict[str, object]]:
    """Render one selected time range as a vertical MP4 clip."""
    profile = _render_profile(processing_mode)
    filter_graph = _build_filter_graph(profile)
    source_duration = get_duration(source_path)
    if start_seconds < 0 or start_seconds >= source_duration:
        raise VideoProcessingError("Cut start must be inside the source video's duration.")
    if end_seconds <= start_seconds:
        raise VideoProcessingError("Cut end must be later than cut start.")
    actual_end = min(float(end_seconds), source_duration)
    clip_duration = actual_end - float(start_seconds)
    if clip_duration <= 0:
        raise VideoProcessingError("The selected cut range is empty.")

    output_dir.mkdir(parents=True, exist_ok=True)
    filename = "clip-001.mp4"
    output_path = output_dir / filename
    badge_path = output_dir / ".badge-clip.png"
    _badge_image(badge_path, "CLIP 1")
    command = [
        FFMPEG_PATH, "-hide_banner", "-loglevel", "error", "-y",
        "-ss", f"{float(start_seconds):.3f}", "-i", str(source_path),
        "-loop", "1", "-framerate", "30", "-i", str(badge_path),
        "-t", f"{clip_duration:.3f}",
        "-filter_complex", filter_graph,
        "-map", "[video]", "-map", "0:a?",
        "-c:v", "libx264", "-preset", str(profile["preset"]), "-crf", str(profile["crf"]),
        "-c:a", "aac", "-b:a", str(profile["audio_bitrate"]), "-ar", "44100",
        "-r", "30", "-movflags", "+faststart", str(output_path),
    ]
    try:
        _run(command)
    finally:
        badge_path.unlink(missing_ok=True)

    clip = {
        "part": 1,
        "filename": filename,
        "duration": round(clip_duration, 3),
        "start_seconds": float(start_seconds),
        "url": "/api/jobs/CLIP_JOB_ID/clips/" + filename,
        "publish_status": "not_started",
    }
    if on_progress:
        on_progress(1, 1, output_path, clip_duration)
    return [clip]

