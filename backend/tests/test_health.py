from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_healthz_returns_ok() -> None:
    response = client.get("/healthz")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["service"] == "fitmate-backend"


def test_versioned_healthz_returns_ok() -> None:
    response = client.get("/v1/healthz")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
