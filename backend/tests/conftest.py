from datetime import datetime, timezone
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from alembic import command
from alembic.config import Config
from app.core.config import Settings
from app.main import create_app


@pytest.fixture
def app(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path / 'test.db'}"
    secret = "test-secret-only-not-production-value-1234"
    monkeypatch.setenv("DATABASE_URL", url)
    monkeypatch.setenv("JWT_SECRET", secret)
    cfg = Config(str(Path(__file__).parents[1] / "alembic.ini"))
    command.upgrade(cfg, "head")
    application = create_app(Settings(url, secret))
    # Business time is fixed within today's date; JWTs use the actual authentication clock.
    actual = datetime.now(timezone.utc)
    application.state.clock = lambda: actual
    yield application
    application.state.engine.dispose()


@pytest.fixture
def client(app):
    with TestClient(app) as c:
        yield c


def account(client, username="alice", nickname="张同学"):
    response = client.post(
        "/auth/register", json={"username": username, "password": "Password123!", "nickname": nickname}
    )
    assert response.status_code == 201, response.text
    uid = response.json()["id"]
    login = client.post("/auth/login", json={"username": username, "password": "Password123!"})
    assert login.status_code == 200, login.text
    return uid, {"Authorization": "Bearer " + login.json()["access_token"]}


def setup_dorm(client):
    a, ha = account(client)
    b, hb = account(client, "bob", "李同学")
    dorm = client.post("/dorms", headers=ha, json={"name": "6-402"}).json()
    joined = client.post("/dorms/join", headers=hb, json={"invite_code": dorm["invite_code"]})
    assert joined.status_code == 200, joined.text
    return a, ha, b, hb, joined.json()


def current(client, headers):
    return client.get("/dorms/current", headers=headers).json()
