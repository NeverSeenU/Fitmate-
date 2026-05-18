from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.main import app
from app.repositories.sqlalchemy.auth import SqlAlchemyAuthRepository
from app.repositories.sqlalchemy.usage import SqlAlchemyUsageCounterRepository


client = TestClient(app)


def auth_headers(email: str) -> dict[str, str]:
    response = client.post(
        "/v1/auth/register",
        json={
            "email": email,
            "password": "StrongPass123",
            "display_name": "Records Test",
        },
    )
    assert response.status_code == 201
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def restore_plan(headers: dict[str, str], product_id: str) -> None:
    response = client.post(
        "/v1/subscription/restore",
        headers=headers,
        json={"provider": "app_store", "product_id": product_id, "receipt": "dev-receipt"},
    )
    assert response.status_code == 200


def usage_for_email(email: str):
    from datetime import date

    with SessionLocal() as session:
        user = SqlAlchemyAuthRepository(session).get_user_by_email(email)
        assert user is not None
        return SqlAlchemyUsageCounterRepository(session).get_or_create(user.id, date.today())


def test_records_today_requires_authentication() -> None:
    response = client.get("/v1/records/today")

    assert response.status_code == 401
    assert response.json()["detail"] == "not_authenticated"


def test_records_today_returns_daily_summary_shape() -> None:
    headers = auth_headers("records-summary@example.com")
    client.post(
        "/v1/me/onboarding",
        headers=headers,
        json={
            "height_cm": 175,
            "current_weight_kg": 72,
            "age": 23,
            "sex": "female",
            "goal_label": "wedding fat loss",
        },
    )

    response = client.get("/v1/records/today", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["date"]
    assert body["calories_range_kcal"] == [0, 0]
    assert body["protein_floor_g"] == 115
    assert body["weight_kg"] == 72
    assert body["hunger_score"] is None
    assert body["food_logs"] == []
    assert body["workout_logs"] == []
    assert "先拍照" in body["ai_summary"]


def test_checkin_updates_today_weight_and_hunger() -> None:
    headers = auth_headers("records-checkin@example.com")

    response = client.post(
        "/v1/checkins",
        headers=headers,
        json={
            "weight_kg": 71.6,
            "hunger_level": 7,
            "mood_level": 5,
            "craving_level": 8,
            "notes": "training day",
        },
    )

    assert response.status_code == 201
    checkin = response.json()
    assert checkin["weight_kg"] == 71.6
    assert checkin["hunger_level"] == 7

    today = client.get("/v1/records/today", headers=headers).json()
    assert today["weight_kg"] == 71.6
    assert today["hunger_score"] == 7
    assert today["mood_score"] == 5
    assert today["craving_score"] == 8


def test_checkin_patch_and_delete_flow() -> None:
    headers = auth_headers("records-edit-checkin@example.com")

    created = client.post(
        "/v1/checkins",
        headers=headers,
        json={
            "weight_kg": 72,
            "hunger_level": 4,
            "mood_level": 5,
            "craving_level": 3,
            "notes": "morning",
        },
    )
    assert created.status_code == 201
    checkin_id = created.json()["id"]

    patched = client.patch(
        f"/v1/checkins/{checkin_id}",
        headers=headers,
        json={
            "weight_kg": 71.4,
            "hunger_level": 6,
            "mood_level": 8,
            "craving_level": 2,
            "notes": "edited diary",
        },
    )
    assert patched.status_code == 200
    assert patched.json()["weight_kg"] == 71.4
    assert patched.json()["mood_level"] == 8
    assert patched.json()["notes"] == "edited diary"

    today = client.get("/v1/records/today", headers=headers).json()
    assert today["weight_kg"] == 71.4
    assert today["hunger_score"] == 6
    assert today["checkins"][0]["id"] == checkin_id

    deleted = client.delete(f"/v1/checkins/{checkin_id}", headers=headers)
    assert deleted.status_code == 204
    assert client.get("/v1/records/today", headers=headers).json()["checkins"] == []


def test_pro_workout_analysis_creates_pending_log_and_confirm_flow() -> None:
    email = "records-workout@example.com"
    headers = auth_headers(email)
    restore_plan(headers, "fitmate.pro.monthly")

    response = client.post(
        "/v1/workouts/analyze",
        headers=headers,
        json={"text": "椭圆机 45 分钟，中高强度，然后练腿 35 分钟"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["workout_analysis"]["workout_log_id"]
    assert body["workout_analysis"]["status"] == "pending"
    assert body["workout_analysis"]["duration_minutes"] == 80
    assert body["workout_analysis"]["calories_burned_range_kcal"] == [360, 560]
    assert usage_for_email(email).workout_analysis_count == 1

    today = client.get("/v1/records/today", headers=headers).json()
    assert len(today["workout_logs"]) == 1
    assert today["workout_logs"][0]["status"] == "pending"

    workout_log_id = body["workout_analysis"]["workout_log_id"]
    edit = client.patch(
        f"/v1/workouts/logs/{workout_log_id}",
        headers=headers,
        json={"duration_minutes": 75, "intensity": "medium"},
    )
    assert edit.status_code == 200
    assert edit.json()["duration_minutes"] == 75
    assert edit.json()["status"] == "edited"

    confirm = client.post(f"/v1/workouts/logs/{workout_log_id}/confirm", headers=headers)
    assert confirm.status_code == 200
    assert confirm.json()["status"] == "confirmed"


def test_file_synced_food_and_workout_logs_persist_to_records() -> None:
    headers = auth_headers("records-file-sync@example.com")

    food = client.post(
        "/v1/food/logs",
        headers=headers,
        json={
            "meal_name": "File menu nutrition",
            "calories_range_kcal": [550, 550],
            "protein_g_range": [35, 35],
            "carbs_g_range": [0, 0],
            "fat_g_range": [0, 0],
            "status": "confirmed",
            "user_portion_note": "Synced from file: menu.csv",
        },
    )
    assert food.status_code == 201
    assert food.json()["status"] == "confirmed"

    workout = client.post(
        "/v1/workouts/logs",
        headers=headers,
        json={
            "workout_type": "file_plan",
            "duration_minutes": 0,
            "intensity": "medium",
            "calories_burned_range_kcal": [0, 0],
            "status": "confirmed",
        },
    )
    assert workout.status_code == 201
    assert workout.json()["status"] == "confirmed"

    today = client.get("/v1/records/today", headers=headers).json()
    assert len(today["food_logs"]) == 1
    assert today["food_logs"][0]["meal_name"] == "File menu nutrition"
    assert today["food_logs"][0]["user_portion_note"] == "Synced from file: menu.csv"
    assert today["calories_range_kcal"] == [550, 550]
    assert len(today["workout_logs"]) == 1
    assert today["workout_logs"][0]["workout_type"] == "file_plan"


def test_free_workout_analysis_does_not_auto_create_log() -> None:
    email = "records-free-workout@example.com"
    headers = auth_headers(email)

    response = client.post(
        "/v1/workouts/analyze",
        headers=headers,
        json={"text": "跑步 30 分钟，轻松强度"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["workout_analysis"]["workout_log_id"] is None
    assert body["workout_analysis"]["status"] == "analysis_only"
    assert usage_for_email(email).workout_analysis_count == 1
    assert client.get("/v1/records/today", headers=headers).json()["workout_logs"] == []


def test_workout_fair_use_limit_returns_429() -> None:
    from datetime import date

    email = "records-workout-limit@example.com"
    headers = auth_headers(email)
    with SessionLocal() as session:
        user = SqlAlchemyAuthRepository(session).get_user_by_email(email)
        assert user is not None
        usage_repo = SqlAlchemyUsageCounterRepository(session)
        for _ in range(20):
            usage_repo.increment(user.id, date.today(), "workout")
        session.commit()

    response = client.post(
        "/v1/workouts/analyze",
        headers=headers,
        json={"text": "跑步 30 分钟"},
    )

    assert response.status_code == 429
    assert response.json()["detail"]["purpose"] == "workout"
