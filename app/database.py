from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from typing import Any

from app.config import DB_PATH, TOKEN_CIPHER


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with _connect() as conn:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS pages (
                page_id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                encrypted_token TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )"""
        )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )"""
        )


def save_pages(pages: list[dict[str, Any]]) -> None:
    now = datetime.now(timezone.utc).isoformat()
    with _connect() as conn:
        for page in pages:
            page_id = str(page.get("id", ""))
            name = str(page.get("name", "Facebook Page"))
            access_token = str(page.get("access_token", ""))
            if not page_id or not access_token:
                continue
            encrypted = TOKEN_CIPHER.encrypt(access_token.encode("utf-8")).decode("ascii")
            conn.execute(
                """INSERT INTO pages(page_id, name, encrypted_token, updated_at)
                   VALUES(?, ?, ?, ?)
                   ON CONFLICT(page_id) DO UPDATE SET
                     name=excluded.name,
                     encrypted_token=excluded.encrypted_token,
                     updated_at=excluded.updated_at""",
                (page_id, name, encrypted, now),
            )


def list_pages() -> list[dict[str, str]]:
    with _connect() as conn:
        rows = conn.execute("SELECT page_id, name FROM pages ORDER BY name COLLATE NOCASE").fetchall()
    return [{"id": row["page_id"], "name": row["name"]} for row in rows]


def set_setting(key: str, value: str) -> None:
    with _connect() as conn:
        conn.execute(
            "INSERT INTO settings(key, value) VALUES(?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (key, value),
        )


def get_setting(key: str) -> str | None:
    with _connect() as conn:
        row = conn.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
    return str(row["value"]) if row else None


def select_page(page_id: str) -> bool:
    with _connect() as conn:
        row = conn.execute("SELECT page_id FROM pages WHERE page_id=?", (page_id,)).fetchone()
        if row is None:
            return False
        conn.execute(
            "INSERT INTO settings(key, value) VALUES('selected_page_id', ?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (page_id,),
        )
    return True


def selected_page_with_token() -> dict[str, str] | None:
    page_id = get_setting("selected_page_id")
    if not page_id:
        return None
    with _connect() as conn:
        row = conn.execute(
            "SELECT page_id, name, encrypted_token FROM pages WHERE page_id=?", (page_id,)
        ).fetchone()
    if row is None:
        return None
    token = TOKEN_CIPHER.decrypt(row["encrypted_token"].encode("ascii")).decode("utf-8")
    return {"id": row["page_id"], "name": row["name"], "access_token": token}
