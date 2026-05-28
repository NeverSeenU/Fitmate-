from fastapi.testclient import TestClient

from app.ai.router import FoodVisionUnavailableError
from app.api import food as food_api
from app.db.session import SessionLocal
from app.main import app
from app.repositories.sqlalchemy.auth import SqlAlchemyAuthRepository
from app.repositories.sqlalchemy.usage import SqlAlchemyUsageCounterRepository


client = TestClient(app)


VISION_ANALYSIS = {
    "meal_name": "韩式石锅拌饭",
    "detected_items": ["rice", "egg", "vegetables", "sauce"],
    "calories_range_kcal": [600, 900],
    "protein_g_range": [25, 40],
    "carbs_g_range": [70, 100],
    "fat_g_range": [18, 35],
    "confidence": 0.72,
    "needs_follow_up": False,
    "follow_up_question": None,
    "fat_loss_advice": "下一餐压低油和主食，蛋白补足。",
    "supportive_reply": "能吃，先按区间记录，不需要因为一餐焦虑。",
    "safety_flags": [],
    "model_provider": "xiaomi",
    "model_name": "mimo-v2-omni",
}


class FakeVisionRouter:
    def analyze_food_photo(
        self,
        image_bytes: bytes,
        user_note: str | None = None,
        user_id: str | None = None,
    ) -> dict:
        assert image_bytes in {b"fake-image", b"converted-jpeg"}
        return dict(VISION_ANALYSIS)


class GroupingVisionRouter:
    def __init__(self) -> None:
        self.calls = 0

    def analyze_food_photo(
        self,
        image_bytes: bytes,
        user_note: str | None = None,
        user_id: str | None = None,
    ) -> dict:
        self.calls += 1
        analysis = dict(VISION_ANALYSIS)
        analysis["meal_name"] = "牛肉汉堡" if self.calls == 1 else "水果沙拉"
        analysis["detected_items"] = ["burger"] if self.calls == 1 else ["salad"]
        assert user_note is not None and f"第 {self.calls}/2 张" in user_note
        return analysis


class UnavailableVisionRouter:
    def analyze_food_photo(
        self,
        image_bytes: bytes,
        user_note: str | None = None,
        user_id: str | None = None,
    ) -> dict:
        raise FoodVisionUnavailableError("all_vision_providers_failed")


def auth_headers(email: str) -> dict[str, str]:
    response = client.post(
        "/v1/auth/register",
        json={
            "email": email,
            "password": "StrongPass123",
            "display_name": "Food Flow Test",
        },
    )
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def create_thread(headers: dict[str, str]) -> str:
    response = client.post(
        "/v1/chat/threads",
        headers=headers,
        json={"title": "今日饮食分析", "kind": "food"},
    )
    return response.json()["id"]


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


def setup_module() -> None:
    try:
        from app.api.food import get_food_vision_router
    except ModuleNotFoundError:
        return

    app.dependency_overrides[get_food_vision_router] = lambda: FakeVisionRouter()


def teardown_module() -> None:
    app.dependency_overrides.clear()


def test_photo_requires_authentication() -> None:
    response = client.post(
        "/v1/chat/photo",
        data={"thread_id": "missing", "user_note": "晚餐"},
        files={"image": ("food.jpg", b"fake-image", "image/jpeg")},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "not_authenticated"


def test_free_user_receives_analysis_without_auto_created_food_log() -> None:
    email = "free-food@example.com"
    headers = auth_headers(email)
    thread_id = create_thread(headers)

    response = client.post(
        "/v1/chat/photo",
        headers=headers,
        data={"thread_id": thread_id, "user_note": "训练后晚餐"},
        files={"image": ("food.jpg", b"fake-image", "image/jpeg")},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["food_analysis"]["food_log_id"] is None
    assert body["food_analysis"]["status"] == "analysis_only"
    assert body["food_analysis"]["meal_name"] == "韩式石锅拌饭"
    assert body["food_analysis"]["detected_items"] == ["rice", "egg", "vegetables", "sauce"]
    assert body["food_analysis"]["fat_loss_advice"] == "下一餐压低油和主食，蛋白补足。"
    assert body["assistant_message"]["message_type"] == "food_analysis"
    assert "焦虑" in body["assistant_message"]["content_text"]
    assert usage_for_email(email).food_photo_count == 1


def test_multi_photo_endpoint_returns_structured_analyses_and_groups() -> None:
    email = "multi-photo@example.com"
    headers = auth_headers(email)
    thread_id = create_thread(headers)
    app.dependency_overrides[food_api.get_food_vision_router] = lambda: GroupingVisionRouter()

    try:
        response = client.post(
            "/v1/chat/photos",
            headers=headers,
            data={"thread_id": thread_id, "user_note": "帮我分别估算"},
            files=[
                ("images", ("burger.jpg", b"fake-image", "image/jpeg")),
                ("images", ("salad.jpg", b"fake-image", "image/jpeg")),
            ],
        )
    finally:
        app.dependency_overrides[food_api.get_food_vision_router] = lambda: FakeVisionRouter()

    assert response.status_code == 200
    body = response.json()
    assert [item["meal_name"] for item in body["food_analyses"]] == ["牛肉汉堡", "水果沙拉"]
    assert len(body["assistant_messages"]) == 2
    assert body["groups"] == [
        {"group_id": "牛肉汉堡", "analysis_indexes": [0], "meal_name": "牛肉汉堡"},
        {"group_id": "水果沙拉", "analysis_indexes": [1], "meal_name": "水果沙拉"},
    ]
    assert usage_for_email(email).food_photo_count == 2


def test_photo_rejects_unsupported_upload_type() -> None:
    headers = auth_headers("unsupported-photo@example.com")
    thread_id = create_thread(headers)

    response = client.post(
        "/v1/chat/photo",
        headers=headers,
        data={"thread_id": thread_id},
        files={"image": ("notes.txt", b"not-an-image", "text/plain")},
    )

    assert response.status_code == 415
    assert response.json()["detail"]["code"] == "unsupported_image_type"


def test_photo_converts_heic_before_analysis(monkeypatch) -> None:
    headers = auth_headers("unsupported-heic@example.com")
    thread_id = create_thread(headers)
    monkeypatch.setattr(food_api, "normalize_for_ai_provider", lambda image_bytes: b"converted-jpeg")

    response = client.post(
        "/v1/chat/photo",
        headers=headers,
        data={"thread_id": thread_id},
        files={"image": ("photo.heic", b"heic-image", "image/heic")},
    )

    assert response.status_code == 200
    assert response.json()["food_analysis"]["meal_name"] == VISION_ANALYSIS["meal_name"]


def test_photo_converts_heic_bytes_even_when_labeled_jpeg(monkeypatch) -> None:
    headers = auth_headers("unsupported-heic-bytes@example.com")
    thread_id = create_thread(headers)
    heic_bytes = b"\x00\x00\x00\x18ftypheic\x00\x00\x00\x00"
    monkeypatch.setattr(food_api, "normalize_for_ai_provider", lambda image_bytes: b"converted-jpeg")

    response = client.post(
        "/v1/chat/photo",
        headers=headers,
        data={"thread_id": thread_id},
        files={"image": ("photo.jpg", heic_bytes, "image/jpeg")},
    )

    assert response.status_code == 200
    assert response.json()["food_analysis"]["meal_name"] == VISION_ANALYSIS["meal_name"]


def test_photo_rejects_uploads_larger_than_limit() -> None:
    headers = auth_headers("large-photo@example.com")
    thread_id = create_thread(headers)

    response = client.post(
        "/v1/chat/photo",
        headers=headers,
        data={"thread_id": thread_id},
        files={"image": ("large.jpg", b"x" * (8 * 1024 * 1024 + 1), "image/jpeg")},
    )

    assert response.status_code == 413
    assert response.json()["detail"]["code"] == "image_too_large"


def test_photo_with_local_fallback_thread_id_returns_not_found_not_500() -> None:
    headers = auth_headers("fallback-thread-photo@example.com")

    response = client.post(
        "/v1/chat/photo",
        headers=headers,
        data={"thread_id": "food-today"},
        files={"image": ("food.jpg", b"fake-image", "image/jpeg")},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "thread_not_found"


def test_photo_fair_use_limit_returns_429_before_analysis() -> None:
    from datetime import date

    email = "photo-limit@example.com"
    headers = auth_headers(email)
    thread_id = create_thread(headers)
    with SessionLocal() as session:
        user = SqlAlchemyAuthRepository(session).get_user_by_email(email)
        assert user is not None
        usage_repo = SqlAlchemyUsageCounterRepository(session)
        for _ in range(10):
            usage_repo.increment(user.id, date.today(), "food_photo")
        session.commit()

    response = client.post(
        "/v1/chat/photo",
        headers=headers,
        data={"thread_id": thread_id},
        files={"image": ("food.jpg", b"fake-image", "image/jpeg")},
    )

    assert response.status_code == 429
    assert response.json()["detail"]["purpose"] == "food_photo"


def test_pro_user_photo_creates_pending_food_log() -> None:
    headers = auth_headers("pro-food@example.com")
    restore_plan(headers, "fitmate.pro.monthly")
    thread_id = create_thread(headers)

    response = client.post(
        "/v1/chat/photo",
        headers=headers,
        data={"thread_id": thread_id, "user_note": "训练后很饿"},
        files={"image": ("food.jpg", b"fake-image", "image/jpeg")},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["food_analysis"]["food_log_id"]
    assert body["food_analysis"]["status"] == "pending"
    assert body["food_analysis"]["model_provider"] == "xiaomi"

    logs = client.get("/v1/food/logs", headers=headers).json()["food_logs"]
    assert len(logs) == 1
    assert logs[0]["id"] == body["food_analysis"]["food_log_id"]
    assert logs[0]["status"] == "pending"


def test_photo_analysis_returns_stable_unavailable_error_when_providers_are_missing() -> None:
    from app.api.food import get_food_vision_router

    app.dependency_overrides[get_food_vision_router] = lambda: UnavailableVisionRouter()
    headers = auth_headers("vision-unavailable@example.com")
    thread_id = create_thread(headers)

    response = client.post(
        "/v1/chat/photo",
        headers=headers,
        data={"thread_id": thread_id, "user_note": "晚餐"},
        files={"image": ("food.jpg", b"fake-image", "image/jpeg")},
    )

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "vision_unavailable"
    assert usage_for_email("vision-unavailable@example.com").food_photo_count == 0

    app.dependency_overrides[get_food_vision_router] = lambda: FakeVisionRouter()


def test_confirm_edit_and_discard_food_log() -> None:
    headers = auth_headers("edit-food@example.com")
    restore_plan(headers, "fitmate.pro.monthly")
    thread_id = create_thread(headers)
    created = client.post(
        "/v1/chat/photo",
        headers=headers,
        data={"thread_id": thread_id},
        files={"image": ("food.jpg", b"fake-image", "image/jpeg")},
    ).json()["food_analysis"]
    food_log_id = created["food_log_id"]

    edit_response = client.patch(
        f"/v1/food/logs/{food_log_id}",
        headers=headers,
        json={"meal_name": "少饭版石锅拌饭", "user_portion_note": "米饭吃了一半"},
    )
    assert edit_response.status_code == 200
    assert edit_response.json()["meal_name"] == "少饭版石锅拌饭"
    assert edit_response.json()["status"] == "edited"

    confirm_response = client.post(f"/v1/food/logs/{food_log_id}/confirm", headers=headers)
    assert confirm_response.status_code == 200
    assert confirm_response.json()["status"] == "confirmed"

    discard_response = client.post(f"/v1/food/logs/{food_log_id}/discard", headers=headers)
    assert discard_response.status_code == 200
    assert discard_response.json()["status"] == "discarded"

    delete_response = client.delete(f"/v1/food/logs/{food_log_id}", headers=headers)
    assert delete_response.status_code == 204
    assert client.get("/v1/food/logs", headers=headers).json()["food_logs"] == []
