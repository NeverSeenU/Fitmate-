from fastapi.testclient import TestClient

from app.api.diagnostics import _food_vision_provider_order
from app.main import app


client = TestClient(app)


def test_versioned_healthz_stays_public_and_minimal() -> None:
    response = client.get("/v1/healthz")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "fitmate-backend"
    assert "providers" not in body
    assert "XIAOMI_API_KEY" not in str(body)


def test_local_smoke_diagnostics_reports_capabilities_without_secrets(monkeypatch) -> None:
    monkeypatch.setenv("XIAOMI_API_KEY", "xiaomi-secret-value")
    monkeypatch.setenv("QWEN_API_KEY", "qwen-secret-value")
    monkeypatch.setenv("CHAT_AI_REPLY_ENABLED", "true")
    monkeypatch.setenv("TEXT_FOOD_AI_ANALYSIS_ENABLED", "true")

    response = client.get("/v1/diagnostics/smoke")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["readiness"]["backend_reachable"] is True
    assert body["readiness"]["chat_ai_ready"] is True
    assert body["readiness"]["food_vision_ready"] is True
    assert body["providers"]["xiaomi"]["configured"] is True
    assert body["providers"]["qwen"]["configured"] is True
    assert body["routing"]["chat_reply_provider_order"] == ["xiaomi", "qwen"]
    serialized = str(body)
    assert "xiaomi-secret-value" not in serialized
    assert "qwen-secret-value" not in serialized
    assert "API_KEY" not in serialized


def test_non_local_smoke_diagnostics_requires_admin_secret(monkeypatch) -> None:
    monkeypatch.setenv("FITMATE_ENV", "production")
    monkeypatch.setenv("ADMIN_SECRET", "admin-secret-value-with-enough-length")

    unauthenticated = client.get("/v1/diagnostics/smoke")
    authenticated = client.get(
        "/v1/diagnostics/smoke",
        headers={"X-Fitmate-Admin-Secret": "admin-secret-value-with-enough-length"},
    )

    assert unauthenticated.status_code == 401
    assert unauthenticated.json()["detail"] == "admin_auth_required"
    assert authenticated.status_code == 200


def test_food_vision_provider_order_respects_forced_provider() -> None:
    assert _food_vision_provider_order("xiaomi", xiaomi_configured=True, qwen_configured=True) == ["xiaomi"]
    assert _food_vision_provider_order("qwen", xiaomi_configured=True, qwen_configured=True) == ["qwen"]
    assert _food_vision_provider_order("auto", xiaomi_configured=False, qwen_configured=True) == ["qwen"]
    assert _food_vision_provider_order("xiaomi", xiaomi_configured=False, qwen_configured=True) == []
