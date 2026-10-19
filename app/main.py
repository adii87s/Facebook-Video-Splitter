from __future__ import annotations

import asyncio
import math
import secrets
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlencode
from uuid import uuid4

import httpx
from fastapi import BackgroundTasks, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field
from starlette.middleware.sessions import SessionMiddleware

from app.config import (
    ALLOWED_EXTENSIONS,
    BASE_DIR,
    CLIP_SECONDS,
    DATA_DIR,
    FACEBOOK_APP_ID,
    FACEBOOK_APP_SECRET,
    FACEBOOK_REDIRECT_URI,
    JOBS_DIR,
    MAX_UPLOAD_BYTES,
    META_GRAPH_API_VERSION,
    SESSION_SECRET,
)
from app.database import init_db, list_pages, save_pages, select_page, selected_page_with_token
from app.job_store import job_dir, public_job, read_job, write_job
from app.services.facebook_publisher import FacebookPublishError, publish_reel
from app.services.video_processor import VideoProcessingError, split_video

app = FastAPI(title="Facebook Video Splitter", version="0.1.0")
app.add_middleware(
    SessionMiddleware,
    secret_key=SESSION_SECRET,
    same_site="lax",
    https_only=False,  # Localhost development. Enable HTTPS-only cookies behind HTTPS in production.
    max_age=60 * 60 * 12,
)
app.mount("/static", StaticFiles(directory=BASE_DIR / "app" / "static"), name="static")
templates = Jinja2Templates(directory=BASE_DIR / "app" / "templates")


@app.on_event("startup")
def on_startup() -> None:
    init_db()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _valid_job_id(job_id: str) -> bool:
    # Jobs are generated as UUID hex strings, so arbitrary paths are never accepted.
    return len(job_id) == 32 and all(c in "0123456789abcdef" for c in job_id.lower())


def _require_job(job_id: str) -> dict[str, Any]:
    if not _valid_job_id(job_id):
        raise HTTPException(status_code=404, detail="Job not found")
    record = read_job(job_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return record


def _job_update(job_id: str, **changes: Any) -> dict[str, Any]:
    record = read_job(job_id)
    if record is None:
        raise RuntimeError("Job record disappeared")
    record.update(changes)
    record["updated_at"] = _now()
    write_job(job_id, record)
    return record


@app.get("/")
def index(request: Request):
    notice = request.session.pop("notice", None)
    return templates.TemplateResponse(
        request=request,
        name="index.html",
        context={"notice": notice},
    )


@app.get("/setup")
def setup_page(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="setup.html",
        context={
            "facebook_app_configured": bool(FACEBOOK_APP_ID and FACEBOOK_APP_SECRET),
            "redirect_uri": FACEBOOK_REDIRECT_URI,
            "graph_api_version": META_GRAPH_API_VERSION,
        },
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/status")
def api_status() -> dict[str, Any]:
    pages = list_pages()
    selected = selected_page_with_token()
    return {
        "facebook_app_configured": bool(FACEBOOK_APP_ID and FACEBOOK_APP_SECRET),
        "facebook_connected": bool(pages),
        "pages": pages,
        "selected_page_id": selected["id"] if selected else None,
        "clip_seconds": CLIP_SECONDS,
        "max_upload_mb": MAX_UPLOAD_BYTES // (1024 * 1024),
    }


@app.get("/auth/facebook/login")
def facebook_login(request: Request):
    if not FACEBOOK_APP_ID or not FACEBOOK_APP_SECRET:
        request.session["notice"] = "Complete the one-time Meta setup first, then return to connect Facebook."
        return RedirectResponse(url="/setup", status_code=303)
    state = secrets.token_urlsafe(32)
    request.session["fb_oauth_state"] = state
    params = {
        "client_id": FACEBOOK_APP_ID,
        "redirect_uri": FACEBOOK_REDIRECT_URI,
        "state": state,
        "response_type": "code",
        "scope": "pages_show_list,pages_read_engagement,pages_manage_posts",
    }
    url = f"https://www.facebook.com/{META_GRAPH_API_VERSION}/dialog/oauth?{urlencode(params)}"
    return RedirectResponse(url=url, status_code=302)


@app.get("/auth/facebook/callback")
async def facebook_callback(request: Request, code: str | None = None, state: str | None = None, error: str | None = None):
    if error:
        request.session["notice"] = "Facebook login was cancelled or denied. No Page was connected."
        return RedirectResponse(url="/", status_code=303)
    expected_state = request.session.pop("fb_oauth_state", None)
    if not expected_state or not state or not secrets.compare_digest(expected_state, state):
        request.session["notice"] = "Facebook login expired or failed its security check. Please connect again."
        return RedirectResponse(url="/", status_code=303)
    if not code:
        request.session["notice"] = "Facebook did not return an authorization code. Please try again."
        return RedirectResponse(url="/", status_code=303)

    base = f"https://graph.facebook.com/{META_GRAPH_API_VERSION}"
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            token_response = await client.get(
                f"{base}/oauth/access_token",
                params={
                    "client_id": FACEBOOK_APP_ID,
                    "client_secret": FACEBOOK_APP_SECRET,
                    "redirect_uri": FACEBOOK_REDIRECT_URI,
                    "code": code,
                },
            )
            token_response.raise_for_status()
            token_data = token_response.json()
            user_token = token_data.get("access_token")
            if not user_token:
                raise ValueError("Meta did not return a user access token")

            # Exchange for a long-lived user token before obtaining Page tokens.
            long_response = await client.get(
                f"{base}/oauth/access_token",
                params={
                    "grant_type": "fb_exchange_token",
                    "client_id": FACEBOOK_APP_ID,
                    "client_secret": FACEBOOK_APP_SECRET,
                    "fb_exchange_token": user_token,
                },
            )
            long_response.raise_for_status()
            long_data = long_response.json()
            user_token = long_data.get("access_token", user_token)

            pages_response = await client.get(
                f"{base}/me/accounts",
                params={
                    "fields": "id,name,access_token",
                    "limit": "100",
                    "access_token": user_token,
                },
            )
            pages_response.raise_for_status()
            pages_data = pages_response.json()
            pages = pages_data.get("data", []) if isinstance(pages_data, dict) else []
            if not pages:
                request.session["notice"] = (
                    "Login succeeded, but no manageable Facebook Pages were returned. "
                    "Check your Page access and Meta permissions."
                )
            else:
                save_pages(pages)
                request.session["notice"] = f"Connected {len(pages)} Facebook Page(s). Select a Page before publishing."
    except (httpx.HTTPError, ValueError, KeyError) as exc:
        detail = str(exc)
        if isinstance(exc, httpx.HTTPStatusError):
            try:
                detail = exc.response.json().get("error", {}).get("message", detail)
            except Exception:
                pass
        request.session["notice"] = f"Facebook connection failed: {detail[:350]}"
    return RedirectResponse(url="/", status_code=303)


class SelectPageRequest(BaseModel):
    page_id: str = Field(min_length=1, max_length=100)


@app.post("/api/facebook/select")
def select_facebook_page(payload: SelectPageRequest) -> dict[str, str]:
    if not select_page(payload.page_id):
        raise HTTPException(status_code=404, detail="That Page is not connected. Reconnect Facebook and try again.")
    page = selected_page_with_token()
    return {"selected_page_id": page["id"], "selected_page_name": page["name"]}  # type: ignore[index]


@app.post("/api/jobs")
async def create_job(background_tasks: BackgroundTasks, video: UploadFile = File(...)) -> dict[str, Any]:
    original_name = Path(video.filename or "video.mp4").name
    extension = Path(original_name).suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=415, detail=f"Unsupported video extension. Use one of: {', '.join(sorted(ALLOWED_EXTENSIONS))}")

    job_id = uuid4().hex
    folder = job_dir(job_id)
    folder.mkdir(parents=True, exist_ok=False)
    source_path = folder / f"source{extension}"
    total_size = 0
    try:
        with source_path.open("wb") as destination:
            while True:
                block = await video.read(1024 * 1024)
                if not block:
                    break
                total_size += len(block)
                if total_size > MAX_UPLOAD_BYTES:
                    raise HTTPException(
                        status_code=413,
                        detail=f"Video exceeds the {MAX_UPLOAD_BYTES // (1024 * 1024)} MiB upload limit. Increase MAX_UPLOAD_MB in .env if needed.",
                    )
                destination.write(block)
    except Exception:
        source_path.unlink(missing_ok=True)
        try:
            folder.rmdir()
        except OSError:
            pass
        raise
    finally:
        await video.close()

    if total_size == 0:
        source_path.unlink(missing_ok=True)
        folder.rmdir()
        raise HTTPException(status_code=400, detail="The uploaded file was empty.")

    record: dict[str, Any] = {
        "id": job_id,
        "source_name": original_name,
        "source_bytes": total_size,
        "source_path": str(source_path),
        "status": "queued",
        "progress": 0,
        "clip_seconds": CLIP_SECONDS,
        "clips": [],
        "publish_status": "not_started",
        "publish_progress": 0,
        "publish_log": [],
        "error": None,
        "created_at": _now(),
        "updated_at": _now(),
    }
    write_job(job_id, record)
    background_tasks.add_task(process_video_job, job_id)
    return public_job(record)


def process_video_job(job_id: str) -> None:
    record = read_job(job_id)
    if not record:
        return
    _job_update(job_id, status="processing", progress=0, error=None)
    source_path = Path(record["source_path"])
    output_dir = job_dir(job_id) / "clips"

    def progress(part: int, total: int, clip_path: Path, duration: float) -> None:
        current = read_job(job_id)
        if not current:
            return
        clip_record = {
            "part": part,
            "filename": clip_path.name,
            "duration": round(duration, 3),
            "start_seconds": (part - 1) * CLIP_SECONDS,
            "url": f"/api/jobs/{job_id}/clips/{clip_path.name}",
            "publish_status": "not_started",
        }
        clips = [clip for clip in current.get("clips", []) if clip.get("part") != part]
        clips.append(clip_record)
        clips.sort(key=lambda item: item["part"])
        current["clips"] = clips
        current["progress"] = min(99, int(part / total * 100))
        current["updated_at"] = _now()
        write_job(job_id, current)

    try:
        clips = split_video(source_path, output_dir, on_progress=progress)
        for clip in clips:
            clip["url"] = f"/api/jobs/{job_id}/clips/{clip['filename']}"
        _job_update(job_id, status="completed", progress=100, clips=clips)
    except (VideoProcessingError, OSError, ValueError) as exc:
        _job_update(job_id, status="error", error=str(exc)[:1500], progress=0)


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str) -> dict[str, Any]:
    record = _require_job(job_id)
    return public_job(record)


@app.get("/api/jobs/{job_id}/clips/{filename}")
def get_clip(job_id: str, filename: str, download: bool = False):
    record = _require_job(job_id)
    allowed = {clip.get("filename") for clip in record.get("clips", [])}
    if filename not in allowed or not filename.endswith(".mp4") or Path(filename).name != filename:
        raise HTTPException(status_code=404, detail="Clip not found")
    path = job_dir(job_id) / "clips" / filename
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Clip is not ready yet")
    return FileResponse(
        path,
        media_type="video/mp4",
        filename=filename if download else None,
        content_disposition_type="attachment" if download else "inline",
    )


class PublishRequest(BaseModel):
    caption_template: str = Field(default="Part {part} of {total}", max_length=500)


@app.post("/api/jobs/{job_id}/publish")
def start_publish(job_id: str, payload: PublishRequest, background_tasks: BackgroundTasks) -> dict[str, Any]:
    record = _require_job(job_id)
    if record.get("status") != "completed" or not record.get("clips"):
        raise HTTPException(status_code=409, detail="Wait for clip processing to finish before publishing.")
    too_short = [clip.get("part") for clip in record["clips"] if float(clip.get("duration", 0)) < 4]
    if too_short:
        raise HTTPException(
            status_code=409,
            detail=f"Facebook Reels need clips of at least 4 seconds. These part(s) are too short: {', '.join(map(str, too_short))}.",
        )
    page = selected_page_with_token()
    if not page:
        raise HTTPException(status_code=409, detail="Connect Facebook and select a Page before publishing.")
    if record.get("publish_status") in {"queued", "publishing", "completed"}:
        raise HTTPException(status_code=409, detail="Publishing is already queued, running, or completed for this job.")

    log = [
        {"part": clip.get("part", index + 1), "filename": clip["filename"], "status": "queued", "message": "Waiting in the publishing queue"}
        for index, clip in enumerate(record["clips"])
    ]
    _job_update(job_id, publish_status="queued", publish_progress=0, publish_log=log, publish_error=None)
    background_tasks.add_task(publish_job, job_id, page["id"], page["name"], page["access_token"], payload.caption_template)
    return public_job(_require_job(job_id))


def publish_job(job_id: str, page_id: str, page_name: str, page_token: str, caption_template: str) -> None:
    record = read_job(job_id)
    if not record:
        return
    clips = sorted(record.get("clips", []), key=lambda item: item.get("part", 0))
    log = record.get("publish_log", [])
    _job_update(job_id, publish_status="publishing", publish_progress=0)
    total = len(clips)
    for index, clip in enumerate(clips):
        part = int(clip.get("part", index + 1))
        filename = str(clip.get("filename", ""))
        path = job_dir(job_id) / "clips" / filename
        caption = caption_template.replace("{part}", str(part)).replace("{total}", str(total))
        caption = f"{caption}\nPart {part} of {total}" if "{part}" not in caption_template and "{total}" not in caption_template else caption
        log = read_job(job_id).get("publish_log", log)  # type: ignore[union-attr]
        if index < len(log):
            log[index].update(status="publishing", message=f"Uploading Part {part} to {page_name}")
        _job_update(job_id, publish_log=log)
        try:
            result = publish_reel(
                clip_path=path,
                page_id=page_id,
                page_access_token=page_token,
                caption=caption,
                title=f"Part {part} of {total}",
            )
            if index < len(log):
                log[index].update(status="submitted", message="Facebook accepted the publish request", video_id=result.get("video_id"))
            _job_update(
                job_id,
                publish_log=log,
                publish_progress=int((index + 1) / total * 100),
            )
        except (FacebookPublishError, OSError, httpx.HTTPError, ValueError) as exc:
            if index < len(log):
                log[index].update(status="failed", message=str(exc)[:800])
            # Stop on the first error to avoid silently skipping or reordering the remaining parts.
            for remaining in log[index + 1 :]:
                remaining["status"] = "blocked"
                remaining["message"] = "Not attempted because the previous part failed"
            _job_update(
                job_id,
                publish_status="error",
                publish_error=f"Part {part} failed: {str(exc)[:800]}",
                publish_log=log,
            )
            return
    _job_update(job_id, publish_status="completed", publish_progress=100, publish_log=log)


@app.post("/api/jobs/{job_id}/publish/reset")
def reset_publish(job_id: str) -> dict[str, Any]:
    record = _require_job(job_id)
    if record.get("publish_status") in {"queued", "publishing"}:
        raise HTTPException(status_code=409, detail="Publishing is running and cannot be reset.")
    _job_update(job_id, publish_status="not_started", publish_progress=0, publish_log=[], publish_error=None)
    return public_job(_require_job(job_id))
