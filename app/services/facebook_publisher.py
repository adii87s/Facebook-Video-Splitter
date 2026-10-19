from __future__ import annotations

import json
from pathlib import Path
from typing import Iterator

import httpx

from app.config import META_GRAPH_API_VERSION


class FacebookPublishError(RuntimeError):
    pass


def _message(response: httpx.Response) -> str:
    try:
        payload = response.json()
    except ValueError:
        return response.text[:1000] or f"Facebook API returned HTTP {response.status_code}"
    if isinstance(payload, dict):
        if isinstance(payload.get("error"), dict):
            error = payload["error"]
            return str(error.get("message") or json.dumps(error))
        return str(payload.get("message") or json.dumps(payload))
    return str(payload)


def _check(response: httpx.Response) -> dict:
    try:
        payload = response.json()
    except ValueError as exc:
        raise FacebookPublishError("Facebook returned an unexpected response format.") from exc
    if response.is_error or (isinstance(payload, dict) and payload.get("success") is False):
        raise FacebookPublishError(_message(response))
    if not isinstance(payload, dict):
        raise FacebookPublishError("Facebook returned an unexpected response.")
    return payload


def _file_chunks(path: Path, chunk_size: int = 1024 * 1024) -> Iterator[bytes]:
    with path.open("rb") as video_file:
        while True:
            chunk = video_file.read(chunk_size)
            if not chunk:
                break
            yield chunk


def publish_reel(
    clip_path: Path,
    page_id: str,
    page_access_token: str,
    caption: str,
    title: str,
    timeout_seconds: float = 300.0,
) -> dict[str, str]:
    """Publish one local MP4 Reel to a Facebook Page using Meta's 3-stage API."""
    graph_base = f"https://graph.facebook.com/{META_GRAPH_API_VERSION}"
    with httpx.Client(timeout=httpx.Timeout(timeout_seconds, connect=30.0)) as client:
        start_response = client.post(
            f"{graph_base}/{page_id}/video_reels",
            params={"upload_phase": "START", "access_token": page_access_token},
        )
        start_data = _check(start_response)
        video_id = str(start_data.get("video_id", ""))
        upload_url = str(
            start_data.get("upload_url")
            or f"https://rupload.facebook.com/video-upload/{META_GRAPH_API_VERSION}/{video_id}"
        )
        if not video_id:
            raise FacebookPublishError("Facebook did not return a video ID for this clip.")

        upload_headers = {
            "Authorization": f"OAuth {page_access_token}",
            "offset": "0",
            "file_size": str(clip_path.stat().st_size),
            "Content-Type": "application/octet-stream",
        }
        upload_response = client.post(
            upload_url,
            headers=upload_headers,
            content=_file_chunks(clip_path),
        )
        _check(upload_response)

        finish_response = client.post(
            f"{graph_base}/{page_id}/video_reels",
            params={
                "access_token": page_access_token,
                "upload_phase": "FINISH",
                "video_id": video_id,
                "video_state": "PUBLISHED",
                "description": caption[:2000],
                "title": title[:255],
            },
        )
        finish_data = _check(finish_response)
        if finish_data.get("success") is not True:
            raise FacebookPublishError(_message(finish_response))
        return {"video_id": video_id, "status": "submitted"}
