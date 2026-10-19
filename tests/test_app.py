from fastapi.testclient import TestClient

import app.main as main


def test_home_and_setup_pages_render():
    with TestClient(main.app) as client:
        home = client.get("/")
        setup = client.get("/setup")

    assert home.status_code == 200
    assert "Cut a selected range" in home.text
    assert "Download all clips (ZIP)" in home.text
    assert "Connect a Facebook Page" in home.text
    assert "Connect Facebook" in home.text
    assert "Publish all clips in order" in home.text
    assert "Auto-publish when clips are ready" in home.text
    assert "Faster" in home.text
    assert "No Facebook login needed" not in home.text
    assert setup.status_code == 200
    assert "FACEBOOK_REDIRECT_URI" in setup.text


def test_facebook_login_redirects_to_setup_when_not_configured(monkeypatch):
    monkeypatch.setattr(main, "FACEBOOK_APP_ID", "")
    monkeypatch.setattr(main, "FACEBOOK_APP_SECRET", "")
    with TestClient(main.app, follow_redirects=False) as client:
        response = client.get("/auth/facebook/login")

    assert response.status_code == 303
    assert response.headers["location"] == "/setup"



def test_invalid_clip_length_is_rejected_before_saving_upload():
    with TestClient(main.app) as client:
        response = client.post(
            "/api/jobs",
            files={"video": ("test.mp4", b"not-a-real-video", "video/mp4")},
            data={"mode": "split", "clip_seconds": "4"},
        )

    assert response.status_code == 422
    assert "between 5 and 300 seconds" in response.json()["detail"]


def test_download_all_clips_returns_zip(monkeypatch, tmp_path):
    from io import BytesIO
    from zipfile import ZipFile

    job_id = "a" * 32
    job_root = tmp_path / job_id
    clips_dir = job_root / "clips"
    clips_dir.mkdir(parents=True)
    (clips_dir / "part-001.mp4").write_bytes(b"part one")
    (clips_dir / "part-002.mp4").write_bytes(b"part two")
    record = {
        "id": job_id,
        "status": "completed",
        "source_name": "my-video.mp4",
        "clips": [
            {"part": 1, "filename": "part-001.mp4"},
            {"part": 2, "filename": "part-002.mp4"},
        ],
    }
    monkeypatch.setattr(main, "_require_job", lambda _job_id: record)
    monkeypatch.setattr(main, "job_dir", lambda _job_id: job_root)

    with TestClient(main.app) as client:
        response = client.get(f"/api/jobs/{job_id}/download-all")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/zip")
    with ZipFile(BytesIO(response.content)) as archive:
        assert archive.namelist() == ["part-001.mp4", "part-002.mp4"]
        assert archive.read("part-001.mp4") == b"part one"



def test_auto_publish_requires_a_selected_facebook_page(monkeypatch):
    monkeypatch.setattr(main, "selected_page_with_token", lambda: None)
    with TestClient(main.app) as client:
        response = client.post(
            "/api/jobs",
            files={"video": ("test.mp4", b"fake-video", "video/mp4")},
            data={"auto_publish": "true"},
        )

    assert response.status_code == 409
    assert "Connect Facebook and select a Page" in response.json()["detail"]



def test_auto_publish_rejects_reel_lengths_over_60_seconds(monkeypatch):
    monkeypatch.setattr(
        main,
        "selected_page_with_token",
        lambda: {"id": "123", "name": "Test Page", "access_token": "private-token"},
    )
    with TestClient(main.app) as client:
        response = client.post(
            "/api/jobs",
            files={"video": ("test.mp4", b"fake-video", "video/mp4")},
            data={"auto_publish": "true", "mode": "split", "clip_seconds": "120"},
        )

    assert response.status_code == 422
    assert "60 seconds or shorter" in response.json()["detail"]
