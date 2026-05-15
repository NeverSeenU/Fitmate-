from fastapi.testclient import TestClient
import pytest

from app.main import app


client = TestClient(app)


def test_register_returns_access_token_and_user() -> None:
    response = client.post(
        "/v1/auth/register",
        json={
            "email": "bride@example.com",
            "password": "StrongPass123",
            "display_name": "婚纱减脂计划",
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["access_token"]
    assert body["token_type"] == "bearer"
    assert body["user"]["email"] == "bride@example.com"
    assert body["user"]["display_name"] == "婚纱减脂计划"
    assert "password" not in body["user"]


def test_register_rejects_duplicate_email() -> None:
    payload = {
        "email": "duplicate@example.com",
        "password": "StrongPass123",
        "display_name": "重复用户",
    }
    assert client.post("/v1/auth/register", json=payload).status_code == 201

    response = client.post("/v1/auth/register", json=payload)

    assert response.status_code == 409
    assert response.json()["detail"] == "email_already_registered"


def test_login_accepts_valid_password() -> None:
    payload = {
        "email": "login@example.com",
        "password": "StrongPass123",
        "display_name": "登录用户",
    }
    assert client.post("/v1/auth/register", json=payload).status_code == 201

    response = client.post(
        "/v1/auth/login",
        json={"email": "login@example.com", "password": "StrongPass123"},
    )

    assert response.status_code == 200
    assert response.json()["access_token"]


def test_login_rejects_invalid_password() -> None:
    payload = {
        "email": "wrong-password@example.com",
        "password": "StrongPass123",
        "display_name": "密码测试",
    }
    assert client.post("/v1/auth/register", json=payload).status_code == 201

    response = client.post(
        "/v1/auth/login",
        json={"email": "wrong-password@example.com", "password": "wrong"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "invalid_credentials"


def test_password_reset_request_and_confirm() -> None:
    payload = {
        "email": "reset@example.com",
        "password": "StrongPass123",
        "display_name": "重置密码",
    }
    assert client.post("/v1/auth/register", json=payload).status_code == 201

    request_response = client.post(
        "/v1/auth/password-reset/request",
        json={"email": "reset@example.com"},
    )
    assert request_response.status_code == 202
    reset_token = request_response.json()["debug_reset_token"]

    confirm_response = client.post(
        "/v1/auth/password-reset/confirm",
        json={"token": reset_token, "new_password": "NewStrongPass123"},
    )
    assert confirm_response.status_code == 200

    old_login = client.post(
        "/v1/auth/login",
        json={"email": "reset@example.com", "password": "StrongPass123"},
    )
    new_login = client.post(
        "/v1/auth/login",
        json={"email": "reset@example.com", "password": "NewStrongPass123"},
    )
    assert old_login.status_code == 401
    assert new_login.status_code == 200


def test_password_reset_request_hides_debug_token_outside_local(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = {
        "email": "reset-production@example.com",
        "password": "StrongPass123",
        "display_name": "Production Reset",
    }
    assert client.post("/v1/auth/register", json=payload).status_code == 201

    monkeypatch.setenv("FITMATE_ENV", "production")
    request_response = client.post(
        "/v1/auth/password-reset/request",
        json={"email": "reset-production@example.com"},
    )

    assert request_response.status_code == 202
    assert request_response.json()["debug_reset_token"] is None
