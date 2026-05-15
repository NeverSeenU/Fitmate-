from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def auth_headers(email: str) -> dict[str, str]:
    response = client.post(
        "/v1/auth/register",
        json={
            "email": email,
            "password": "StrongPass123",
            "display_name": "Chat Test",
        },
    )
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_chat_threads_require_authentication() -> None:
    response = client.get("/v1/chat/threads")

    assert response.status_code == 401
    assert response.json()["detail"] == "not_authenticated"


def test_create_thread_and_list_threads_for_current_user_only() -> None:
    headers = auth_headers("chat-owner@example.com")
    other_headers = auth_headers("chat-other@example.com")

    create_response = client.post(
        "/v1/chat/threads",
        headers=headers,
        json={"title": "今日饮食分析", "kind": "food"},
    )
    assert create_response.status_code == 201
    thread = create_response.json()
    assert thread["title"] == "今日饮食分析"
    assert thread["kind"] == "food"

    owner_threads = client.get("/v1/chat/threads", headers=headers).json()["threads"]
    other_threads = client.get("/v1/chat/threads", headers=other_headers).json()["threads"]
    assert [item["id"] for item in owner_threads] == [thread["id"]]
    assert other_threads == []


def test_send_text_message_persists_user_and_mock_assistant_messages() -> None:
    headers = auth_headers("chat-message@example.com")
    thread = client.post(
        "/v1/chat/threads",
        headers=headers,
        json={"title": "嘴馋急救", "kind": "craving"},
    ).json()

    response = client.post(
        "/v1/chat/messages",
        headers=headers,
        json={
            "thread_id": thread["id"],
            "text": "训练后很饿，想吃甜品",
            "context": {"local_time": "2026-05-07T21:30:00-07:00"},
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["message"]["role"] == "assistant"
    assert body["message"]["message_type"] == "text"
    assert "先喝水" in body["message"]["content_text"]
    assert body["created_records"] == []

    messages = client.get(
        f"/v1/chat/threads/{thread['id']}/messages",
        headers=headers,
    ).json()["messages"]
    assert [message["role"] for message in messages] == ["user", "assistant"]
    assert messages[0]["content_text"] == "训练后很饿，想吃甜品"

def test_food_text_message_returns_editable_food_analysis_card() -> None:
    headers = auth_headers("chat-food-card@example.com")
    thread = client.post(
        "/v1/chat/threads",
        headers=headers,
        json={"title": "Food log", "kind": "food"},
    ).json()

    response = client.post(
        "/v1/chat/messages",
        headers=headers,
        json={
            "thread_id": thread["id"],
            "text": "我吃了半碗米饭和鸡胸肉",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["message"]["message_type"] == "food_analysis"
    assert body["created_records"] == []
    assert body["food_analysis"]["food_log_id"] is None
    assert body["food_analysis"]["status"] == "pending"
    assert body["food_analysis"]["meal_name"] == "半碗米饭和鸡胸肉"
    assert body["food_analysis"]["calories_range_kcal"][1] > 0
    assert body["food_analysis"]["protein_g_range"][1] > 0


def test_user_cannot_read_another_users_thread_messages() -> None:
    owner_headers = auth_headers("thread-owner@example.com")
    other_headers = auth_headers("thread-reader@example.com")
    thread = client.post(
        "/v1/chat/threads",
        headers=owner_headers,
        json={"title": "私密对话", "kind": "general"},
    ).json()

    response = client.get(
        f"/v1/chat/threads/{thread['id']}/messages",
        headers=other_headers,
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "thread_not_found"
