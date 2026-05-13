from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def auth_headers(email: str) -> dict[str, str]:
    response = client.post(
        "/v1/auth/register",
        json={
            "email": email,
            "password": "StrongPass123",
            "display_name": "Safety Test",
        },
    )
    assert response.status_code == 201
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_safety_disclaimer_is_public() -> None:
    response = client.get("/v1/safety/disclaimer")

    assert response.status_code == 200
    body = response.json()
    assert body["version"]
    assert "medical diagnosis" in body["disclaimer_en"]
    assert "医疗诊断" in body["disclaimer_zh"]


def test_safety_classifier_logs_high_risk_event() -> None:
    headers = auth_headers("safety-event@example.com")

    response = client.post(
        "/v1/safety/classify",
        headers=headers,
        json={"text": "我想靠泻药和一天只吃一点点快速掉秤"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["risk_type"] == "purging_or_laxative"
    assert body["severity"] == "high"
    assert body["event_id"]
    assert body["action_taken"] == "supportive_safety_redirect"


def test_privacy_export_and_photo_delete_are_authenticated_placeholders() -> None:
    headers = auth_headers("privacy@example.com")

    export_response = client.get("/v1/privacy/export", headers=headers)
    assert export_response.status_code == 200
    assert export_response.json()["status"] == "queued"
    assert export_response.json()["export_job_id"]

    photo_delete = client.delete("/v1/me/photos", headers=headers)
    assert photo_delete.status_code == 202
    assert photo_delete.json()["status"] == "scheduled"
    assert photo_delete.json()["scope"] == "food_photos"


def test_account_delete_is_soft_delete_placeholder() -> None:
    headers = auth_headers("delete-account@example.com")

    response = client.delete("/v1/me", headers=headers)

    assert response.status_code == 202
    body = response.json()
    assert body["status"] == "scheduled"
    assert body["scope"] == "account"


def test_admin_metrics_requires_admin_secret() -> None:
    unauthorized = client.get("/v1/admin/metrics")
    wrong = client.get("/v1/admin/metrics", headers={"X-FitMate-Admin-Secret": "wrong"})

    assert unauthorized.status_code == 401
    assert wrong.status_code == 401


def test_admin_metrics_reports_safety_and_model_usage() -> None:
    headers = auth_headers("admin-metrics-source@example.com")
    client.post(
        "/v1/safety/classify",
        headers=headers,
        json={"text": "我想催吐来减肥"},
    )

    response = client.get(
        "/v1/admin/metrics",
        headers={"X-FitMate-Admin-Secret": "fitmate-local-admin-secret"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["safety_events"]["total"] >= 1
    assert body["model_usage"]["total_calls"] == 0
    assert body["model_usage"]["fallback_rate"] == 0
    assert body["model_usage"]["estimated_cost_cents"] == 0
