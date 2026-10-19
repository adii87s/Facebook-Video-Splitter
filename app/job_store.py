from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from app.config import JOBS_DIR


def job_dir(job_id: str) -> Path:
    # Callers validate IDs against the UUID-like generated ID pattern before use.
    path = (JOBS_DIR / job_id).resolve()
    if path.parent != JOBS_DIR.resolve():
        raise ValueError("Invalid job ID")
    return path


def read_job(job_id: str) -> dict[str, Any] | None:
    path = job_dir(job_id) / "job.json"
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def write_job(job_id: str, record: dict[str, Any]) -> None:
    folder = job_dir(job_id)
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / "job.json"
    temp_path = folder / "job.json.tmp"
    temp_path.write_text(json.dumps(record, indent=2), encoding="utf-8")
    os.replace(temp_path, path)


def public_job(record: dict[str, Any]) -> dict[str, Any]:
    safe = dict(record)
    safe.pop("source_path", None)
    safe.pop("facebook_token", None)
    return safe
