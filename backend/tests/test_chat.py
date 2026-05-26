from datetime import date

from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.main import app
from app.repositories.sqlalchemy.auth import SqlAlchemyAuthRepository
from app.repositories.sqlalchemy.usage import SqlAlchemyUsageCounterRepository
from app.services.chat_service import ChatService, InMemoryChatStore, TextChatUnavailableError
from app.services.safety_service import InMemorySafetyEventStore, SafetyService


class FakeTextFoodRouter:
    def analyze_food_text(self, text: str, user_id: str | None = None) -> dict:
        return {
            "meal_name": "AI chicken rice",
            "detected_items": ["chicken", "rice"],
            "calories_range_kcal": [520, 680],
            "protein_g_range": [35, 48],
            "carbs_g_range": [55, 75],
            "fat_g_range": [12, 20],
            "confidence": 0.84,
            "needs_follow_up": False,
            "follow_up_question": None,
            "fat_loss_advice": "Keep sauce light.",
            "supportive_reply": "Logged as a range.",
            "safety_flags": [],
            "model_provider": "xiaomi",
            "model_name": "mimo-test",
        }


class FakeChatReplyRouter:
    def __init__(self) -> None:
        self.calls: list[dict] = []

    def generate_reply(self, text: str, user_id: str | None = None, conversation_context: list[dict] | None = None) -> dict:
        self.calls.append({"text": text, "user_id": user_id, "conversation_context": conversation_context or []})
        return {
            "content_text": "先稳住，这一餐不是整周失败。下一餐正常吃。",
            "model_provider": "xiaomi",
            "model_name": "mimo-v2-omni",
        }


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


def usage_for_email(email: str):
    with SessionLocal() as session:
        user = SqlAlchemyAuthRepository(session).get_user_by_email(email)
        assert user is not None
        return SqlAlchemyUsageCounterRepository(session).get_or_create(user.id, date.today())


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
    assert usage_for_email("chat-message@example.com").ai_text_count == 1


def test_chat_fair_use_limit_returns_429_without_storing_messages() -> None:
    email = "chat-limit@example.com"
    headers = auth_headers(email)
    thread = client.post(
        "/v1/chat/threads",
        headers=headers,
        json={"title": "Limit", "kind": "general"},
    ).json()
    with SessionLocal() as session:
        user = SqlAlchemyAuthRepository(session).get_user_by_email(email)
        assert user is not None
        usage_repo = SqlAlchemyUsageCounterRepository(session)
        for _ in range(80):
            usage_repo.increment(user.id, date.today(), "chat")
        session.commit()

    response = client.post(
        "/v1/chat/messages",
        headers=headers,
        json={"thread_id": thread["id"], "text": "hello"},
    )

    assert response.status_code == 429
    assert response.json()["detail"]["code"] == "fair_use_limit_reached"
    messages = client.get(f"/v1/chat/threads/{thread['id']}/messages", headers=headers).json()["messages"]
    assert messages == []

def test_contract_chat_mock_can_be_disabled_for_production_paths() -> None:
    service = ChatService(store=InMemoryChatStore(), allow_contract_mocks=False)
    thread = service.create_thread(user_id="user-1", title="Food", kind="food")

    try:
        service.send_text_message(
            user_id="user-1",
            thread_id=thread["id"],
            text="训练后很饿",
            context=None,
        )
    except TextChatUnavailableError as exc:
        assert str(exc) == "text_chat_provider_not_configured"
    else:
        raise AssertionError("disabled contract mock must raise")

    assert service.store.list_messages(thread["id"]) == []


def test_text_food_ai_router_can_create_food_card_without_contract_mocks() -> None:
    service = ChatService(
        store=InMemoryChatStore(),
        allow_contract_mocks=False,
        text_food_analysis_router=FakeTextFoodRouter(),
    )
    thread = service.create_thread(user_id="user-1", title="Food", kind="food")

    response = service.send_text_message(
        user_id="user-1",
        thread_id=thread["id"],
        text="我吃了鸡胸饭",
        context=None,
    )

    assert response is not None
    assert response["message"]["message_type"] == "food_analysis"
    assert response["food_analysis"]["meal_name"] == "AI chicken rice"
    assert response["food_analysis"]["model_provider"] == "xiaomi"


def test_recovery_soul_handles_overeating_and_scale_panic_without_generic_mock() -> None:
    service = ChatService(store=InMemoryChatStore())
    thread = service.create_thread(user_id="user-1", title="Recovery", kind="general")

    overeating = service.send_text_message(
        user_id="user-1",
        thread_id=thread["id"],
        text="我刚刚吃多了，有点慌。请不要羞辱我，帮我判断现在最安全的下一步和下一餐怎么补救。",
        context=None,
    )
    scale = service.send_text_message(
        user_id="user-1",
        thread_id=thread["id"],
        text="今天体重上去了，我有点焦虑。请先帮我判断可能原因，再给一个不极端的下一步。",
        context=None,
    )

    assert overeating is not None
    assert scale is not None
    assert "一餐" in overeating["message"]["content_text"]
    assert "不要" in overeating["message"]["content_text"]
    assert "下一餐" in overeating["message"]["content_text"]
    assert "水分" in scale["message"]["content_text"]
    assert "3-7" in scale["message"]["content_text"]
    assert scale["message"]["message_type"] == "text"


def test_high_risk_diet_compensation_routes_to_safety_reply_and_logs_event() -> None:
    safety_store = InMemorySafetyEventStore()
    service = ChatService(
        store=InMemoryChatStore(),
        safety_service_dependency=SafetyService(store=safety_store),
    )
    thread = service.create_thread(user_id="user-1", title="Safety", kind="general")

    response = service.send_text_message(
        user_id="user-1",
        thread_id=thread["id"],
        text="我今天吃爆了，明天不吃饭补回来可以吗？",
        context=None,
    )

    assert response is not None
    assert response["message"]["message_type"] == "safety"
    assert "不是补救" in response["message"]["content_text"]
    assert "正常吃" in response["message"]["content_text"]
    assert response["safety"]["risk_type"] == "extreme_restriction"
    assert len(safety_store.list_events()) == 1
    messages = service.store.list_messages(thread["id"])
    assert safety_store.list_events()[0].source_message_id == messages[0].id


def test_chat_reply_router_can_generate_recovery_soul_bubble() -> None:
    chat_reply_router = FakeChatReplyRouter()
    service = ChatService(store=InMemoryChatStore(), chat_reply_router=chat_reply_router)
    thread = service.create_thread(user_id="user-1", title="Recovery", kind="general")

    response = service.send_text_message(
        user_id="user-1",
        thread_id=thread["id"],
        text="我刚刚吃多了，有点慌。",
        context=None,
    )

    assert response is not None
    assert response["message"]["message_type"] == "text"
    assert response["message"]["content_text"].startswith("先稳住")
    assert response["message"]["model_provider"] == "xiaomi"
    assert response["message"]["model_name"] == "mimo-v2-omni"
    assert chat_reply_router.calls[0]["text"] == "我刚刚吃多了，有点慌。"


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
