from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def auth_headers(email: str) -> dict[str, str]:
    response = client.post(
        "/v1/auth/register",
        json={
            "email": email,
            "password": "StrongPass123",
            "display_name": "Subscription Test",
        },
    )
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_free_subscription_returns_basic_entitlements_without_limits() -> None:
    headers = auth_headers("free-plan@example.com")

    response = client.get("/v1/subscription", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["plan"] == "free"
    assert body["status"] == "active"
    assert body["entitlements"] == {
        "automatic_recording": False,
        "memory_retention": "7_days",
        "priority_analysis": False,
        "deep_review": False,
        "high_confidence_auto_confirm": False,
    }
    assert "limits" not in body
    assert "fair_use" not in body


def test_restore_updates_user_to_pro_entitlements() -> None:
    headers = auth_headers("restore-pro@example.com")

    restore_response = client.post(
        "/v1/subscription/restore",
        headers=headers,
        json={"provider": "app_store", "product_id": "fitmate.pro.monthly", "receipt": "dev-receipt"},
    )
    assert restore_response.status_code == 200

    body = client.get("/v1/subscription", headers=headers).json()
    assert body["plan"] == "pro"
    assert body["entitlements"]["automatic_recording"] is True
    assert body["entitlements"]["memory_retention"] == "extended"
    assert body["entitlements"]["priority_analysis"] is True
    assert body["entitlements"]["high_confidence_auto_confirm"] is False


def test_restore_updates_user_to_elite_entitlements() -> None:
    headers = auth_headers("restore-elite@example.com")

    response = client.post(
        "/v1/subscription/restore",
        headers=headers,
        json={"provider": "app_store", "product_id": "fitmate.elite.monthly", "receipt": "dev-receipt"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["plan"] == "elite"
    assert body["entitlements"]["automatic_recording"] is True
    assert body["entitlements"]["deep_review"] is True
    assert body["entitlements"]["high_confidence_auto_confirm"] is True


def test_checkout_returns_storekit_product_ids() -> None:
    headers = auth_headers("checkout@example.com")

    response = client.post("/v1/subscription/checkout", headers=headers)

    assert response.status_code == 200
    assert response.json() == {
        "provider": "app_store",
        "product_ids": {
            "pro_monthly": "fitmate.pro.monthly",
            "pro_yearly": "fitmate.pro.yearly",
            "elite_monthly": "fitmate.elite.monthly",
            "elite_yearly": "fitmate.elite.yearly",
        },
    }


def test_app_store_webhook_requires_signature() -> None:
    response = client.post(
        "/v1/webhooks/app-store",
        json={"notification_type": "DID_RENEW"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "invalid_app_store_signature"


def test_fair_use_decision_is_backend_only() -> None:
    from app.services.subscription_service import subscription_service

    free_decision = subscription_service.decide_fair_use(
        plan="free",
        purpose="food_photo",
        daily_usage_count=30,
    )
    elite_decision = subscription_service.decide_fair_use(
        plan="elite",
        purpose="food_photo",
        daily_usage_count=30,
    )

    assert free_decision["allowed"] is False
    assert free_decision["reason"] == "upgrade_or_wait"
    assert "limit" not in free_decision
    assert elite_decision["allowed"] is True
    assert "limit" not in elite_decision
