from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def auth_headers(email: str = "profile@example.com") -> dict[str, str]:
    response = client.post(
        "/v1/auth/register",
        json={
            "email": email,
            "password": "StrongPass123",
            "display_name": "Wedding Plan",
        },
    )
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_get_me_requires_authentication() -> None:
    response = client.get("/v1/me")

    assert response.status_code == 401
    assert response.json()["detail"] == "not_authenticated"


def test_onboarding_writes_profile_and_get_me_returns_it() -> None:
    headers = auth_headers("onboarding@example.com")

    onboarding_response = client.post(
        "/v1/me/onboarding",
        headers=headers,
        json={
            "height_cm": 175,
            "current_weight_kg": 72,
            "age": 23,
            "sex": "female",
            "goal_label": "wedding fat loss",
            "goal_weight_kg": 65,
            "goal_date": "2026-08-01",
            "food_preferences": {
                "likes": ["spicy", "strong flavor"],
                "constraints": ["lower oil"],
            },
            "training_baseline": {
                "frequency": "almost daily",
                "duration_minutes": 120,
                "types": ["cardio", "strength", "sculpt"],
            },
            "risk_flags": {
                "medical_conditions": [],
                "eating_disorder_history": False,
            },
        },
    )
    assert onboarding_response.status_code == 200

    me_response = client.get("/v1/me", headers=headers)

    assert me_response.status_code == 200
    body = me_response.json()
    assert body["user"]["email"] == "onboarding@example.com"
    assert body["profile"]["height_cm"] == 175
    assert body["profile"]["current_weight_kg"] == 72
    assert body["profile"]["goal_label"] == "wedding fat loss"
    assert body["profile"]["food_preferences"]["likes"] == ["spicy", "strong flavor"]
    assert body["profile"]["training_baseline"]["duration_minutes"] == 120
    assert body["subscription"]["plan"] == "free"


def test_patch_profile_updates_only_supplied_fields() -> None:
    headers = auth_headers("patch-profile@example.com")
    assert client.post(
        "/v1/me/onboarding",
        headers=headers,
        json={
            "height_cm": 175,
            "current_weight_kg": 72,
            "age": 23,
            "sex": "female",
            "goal_label": "wedding fat loss",
            "food_preferences": {"likes": ["spicy"]},
            "training_baseline": {"duration_minutes": 120},
            "risk_flags": {},
        },
    ).status_code == 200

    patch_response = client.patch(
        "/v1/me/profile",
        headers=headers,
        json={
            "current_weight_kg": 71.4,
            "food_preferences": {"likes": ["spicy"], "constraints": ["less sugar"]},
        },
    )
    assert patch_response.status_code == 200

    profile = client.get("/v1/me", headers=headers).json()["profile"]
    assert profile["height_cm"] == 175
    assert profile["current_weight_kg"] == 71.4
    assert profile["food_preferences"]["constraints"] == ["less sugar"]
