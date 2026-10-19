from fastapi.testclient import TestClient

import app.main as main


def test_home_and_setup_pages_render():
    with TestClient(main.app) as client:
        home = client.get("/")
        setup = client.get("/setup")

    assert home.status_code == 200
    assert "Facebook setup guide" in home.text
    assert setup.status_code == 200
    assert "FACEBOOK_REDIRECT_URI" in setup.text
    assert "pages_manage_posts" in setup.text


def test_facebook_login_redirects_to_setup_when_not_configured(monkeypatch):
    monkeypatch.setattr(main, "FACEBOOK_APP_ID", "")
    monkeypatch.setattr(main, "FACEBOOK_APP_SECRET", "")
    with TestClient(main.app, follow_redirects=False) as client:
        response = client.get("/auth/facebook/login")

    assert response.status_code == 303
    assert response.headers["location"] == "/setup"
