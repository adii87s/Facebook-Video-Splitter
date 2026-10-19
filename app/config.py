from __future__ import annotations

import os
import secrets
import shutil
from pathlib import Path

from dotenv import load_dotenv
from cryptography.fernet import Fernet

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")
DATA_DIR = BASE_DIR / "data"
JOBS_DIR = DATA_DIR / "jobs"
DB_PATH = DATA_DIR / "facebook_splitter.sqlite3"
DATA_DIR.mkdir(parents=True, exist_ok=True)
JOBS_DIR.mkdir(parents=True, exist_ok=True)


def _secret_value(env_name: str, filename: str, create_value) -> str:
    value = os.getenv(env_name, "").strip()
    if value:
        return value
    key_path = DATA_DIR / filename
    if key_path.exists():
        return key_path.read_text(encoding="utf-8").strip()
    value = create_value()
    key_path.write_text(value, encoding="utf-8")
    try:
        key_path.chmod(0o600)
    except OSError:
        pass
    return value


SESSION_SECRET = _secret_value("SESSION_SECRET", "session.key", lambda: secrets.token_urlsafe(48))
TOKEN_ENCRYPTION_KEY = _secret_value(
    "TOKEN_ENCRYPTION_KEY", "token.key", lambda: Fernet.generate_key().decode("ascii")
)
TOKEN_CIPHER = Fernet(TOKEN_ENCRYPTION_KEY.encode("ascii"))

FACEBOOK_APP_ID = os.getenv("FACEBOOK_APP_ID", "").strip()
FACEBOOK_APP_SECRET = os.getenv("FACEBOOK_APP_SECRET", "").strip()
FACEBOOK_REDIRECT_URI = os.getenv(
    "FACEBOOK_REDIRECT_URI", "http://localhost:8000/auth/facebook/callback"
).strip()
META_GRAPH_API_VERSION = os.getenv("META_GRAPH_API_VERSION", "v26.0").strip().strip("/")
MAX_UPLOAD_BYTES = max(1, int(os.getenv("MAX_UPLOAD_MB", "2048"))) * 1024 * 1024

FFMPEG_PATH = os.getenv("FFMPEG_PATH", "").strip() or shutil.which("ffmpeg") or "ffmpeg"
FFPROBE_PATH = os.getenv("FFPROBE_PATH", "").strip() or shutil.which("ffprobe") or "ffprobe"
ALLOWED_EXTENSIONS = {".mp4", ".mov", ".mkv", ".avi", ".webm", ".m4v", ".mpeg", ".mpg"}
CLIP_SECONDS = 60
