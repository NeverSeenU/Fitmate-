from fastapi.testclient import TestClient

from app.main import app


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
        assert image_bytes == b"fake-image"
        return dict(VISION_ANALYSIS)


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
    headers = auth_headers("free-food@example.com")
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
    assert body["assistant_message"]["message_type"] == "food_analysis"
    assert "焦虑" in body["assistant_message"]["content_text"]


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
