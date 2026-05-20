from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any
import uuid

from app.ai.router import TextFoodAnalysisRouter
from app.services.usage_service import usage_service


@dataclass
class StoredThread:
    id: str
    user_id: str
    title: str
    kind: str = "general"
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    archived_at: datetime | None = None


@dataclass
class StoredMessage:
    id: str
    thread_id: str
    user_id: str
    role: str
    message_type: str
    content_text: str | None = None
    image_object_key: str | None = None
    structured_json: dict[str, Any] | None = None
    model_provider: str | None = None
    model_name: str | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


class InMemoryChatStore:
    def __init__(self) -> None:
        self.threads_by_id: dict[str, StoredThread] = {}
        self.messages_by_thread_id: dict[str, list[StoredMessage]] = {}

    def create_thread(self, user_id: str, title: str, kind: str) -> StoredThread:
        thread = StoredThread(id=str(uuid.uuid4()), user_id=user_id, title=title, kind=kind)
        self.threads_by_id[thread.id] = thread
        self.messages_by_thread_id[thread.id] = []
        return thread

    def list_threads(self, user_id: str) -> list[StoredThread]:
        return sorted(
            [
                thread
                for thread in self.threads_by_id.values()
                if thread.user_id == user_id and thread.archived_at is None
            ],
            key=lambda thread: thread.updated_at,
            reverse=True,
        )

    def get_thread(self, user_id: str, thread_id: str) -> StoredThread | None:
        thread = self.threads_by_id.get(thread_id)
        if thread is None or thread.user_id != user_id or thread.archived_at is not None:
            return None
        return thread

    def add_message(self, message: StoredMessage) -> StoredMessage:
        self.messages_by_thread_id.setdefault(message.thread_id, []).append(message)
        thread = self.threads_by_id[message.thread_id]
        thread.updated_at = message.created_at
        return message

    def list_messages(self, thread_id: str) -> list[StoredMessage]:
        return self.messages_by_thread_id.get(thread_id, [])


class TextChatUnavailableError(RuntimeError):
    pass


class ChatService:
    def __init__(
        self,
        store: InMemoryChatStore | None = None,
        allow_contract_mocks: bool = True,
        usage_service_dependency=None,
        text_food_analysis_router: TextFoodAnalysisRouter | None = None,
    ) -> None:
        self.store = store or InMemoryChatStore()
        self.allow_contract_mocks = allow_contract_mocks
        self.usage_service = usage_service_dependency or usage_service
        self.text_food_analysis_router = text_food_analysis_router

    def create_thread(self, user_id: str, title: str, kind: str) -> dict:
        return self._thread_response(self.store.create_thread(user_id, title, kind))

    def list_threads(self, user_id: str) -> dict:
        return {"threads": [self._thread_response(thread) for thread in self.store.list_threads(user_id)]}

    def list_messages(self, user_id: str, thread_id: str) -> dict | None:
        thread = self.store.get_thread(user_id, thread_id)
        if thread is None:
            return None
        return {
            "thread": self._thread_response(thread),
            "messages": [
                self._message_response(message)
                for message in self.store.list_messages(thread_id)
            ],
        }

    def send_text_message(self, user_id: str, thread_id: str, text: str, context: dict | None) -> dict | None:
        thread = self.store.get_thread(user_id, thread_id)
        if thread is None:
            return None
        if not self.allow_contract_mocks and self.text_food_analysis_router is None:
            raise TextChatUnavailableError("text_chat_provider_not_configured")
        self.usage_service.ensure_allowed(user_id, "chat")
        food_analysis = self._text_food_analysis(user_id, text)
        if not self.allow_contract_mocks and food_analysis is None:
            raise TextChatUnavailableError("text_chat_provider_not_configured")
        self.store.add_message(
            StoredMessage(
                id=str(uuid.uuid4()),
                thread_id=thread_id,
                user_id=user_id,
                role="user",
                message_type="text",
                content_text=text,
                structured_json={"context": context or {}},
            )
        )
        assistant_message = self.store.add_message(
            StoredMessage(
                id=str(uuid.uuid4()),
                thread_id=thread_id,
                user_id=user_id,
                role="assistant",
                message_type="food_analysis" if food_analysis else "text",
                content_text=(
                    "我先把这顿生成一张可编辑食物卡片。你确认热量和份量后，再写入今日记录。"
                    if food_analysis
                    else self._mock_ai_response(text)
                ),
                structured_json={"food_analysis": food_analysis} if food_analysis else None,
                model_provider="mock",
                model_name="fitmate-text-food-card" if food_analysis else "fitmate-contract-mock",
            )
        )
        response = {"message": self._message_response(assistant_message), "created_records": []}
        if food_analysis:
            response["food_analysis"] = food_analysis
        self.usage_service.increment(user_id, "chat")
        return response

    def _mock_ai_response(self, text: str) -> str:
        if "甜" in text or "饿" in text:
            return "先喝水，等 10 分钟；如果还饿，选高蛋白小份。你不是没自控力，是训练后身体需要恢复。"
        return "我先帮你记录重点，再给你一个可执行的小步骤。"

    def _text_food_analysis(self, user_id: str, text: str) -> dict[str, Any] | None:
        if not self._looks_like_food_log(text):
            return None
        if self.text_food_analysis_router is not None:
            ai_analysis = self.text_food_analysis_router.analyze_food_text(text=text, user_id=user_id)
            if ai_analysis is not None:
                return self._food_analysis_response(ai_analysis)
        calories = self._estimate_calories(text)
        protein = self._estimate_protein(text)
        carbs = self._estimate_carbs(text)
        fat = self._estimate_fat(text)
        return self._food_analysis_response({
            "meal_name": self._meal_name_from_text(text),
            "calories_range_kcal": [max(calories - 80, 0), calories + 80],
            "protein_g_range": [max(protein - 8, 0), protein + 8],
            "carbs_g_range": [max(carbs - 12, 0), carbs + 12],
            "fat_g_range": [max(fat - 6, 0), fat + 6],
            "confidence": 0.55,
            "needs_follow_up": False,
            "follow_up_question": None,
            "model_provider": "mock",
            "model_name": "fitmate-text-food-card",
        })

    def _food_analysis_response(self, analysis: dict[str, Any]) -> dict[str, Any]:
        return {
            "food_log_id": None,
            "meal_name": analysis["meal_name"],
            "calories_range_kcal": analysis["calories_range_kcal"],
            "protein_g_range": analysis["protein_g_range"],
            "carbs_g_range": analysis["carbs_g_range"],
            "fat_g_range": analysis["fat_g_range"],
            "confidence": analysis["confidence"],
            "status": "pending",
            "needs_follow_up": analysis.get("needs_follow_up", False),
            "follow_up_question": analysis.get("follow_up_question"),
            "model_provider": analysis.get("model_provider"),
            "model_name": analysis.get("model_name"),
        }

    def _looks_like_food_log(self, text: str) -> bool:
        if any(marker in text for marker in ["想吃", "嘴馋", "很饿"]):
            return False
        if any(marker in text for marker in ["吃了", "喝了", "早餐", "午餐", "晚餐", "夜宵"]):
            return True
        food_terms = [
            "米饭",
            "鸡胸",
            "牛肉",
            "鱼",
            "鸡蛋",
            "面",
            "饭",
            "沙拉",
            "火锅",
            "奶茶",
            "咖啡",
            "拿铁",
            "蛋白",
        ]
        return any(term in text for term in food_terms)

    def _meal_name_from_text(self, text: str) -> str:
        meal_name = text.strip()
        for prefix in ["我吃了", "吃了", "我喝了", "喝了"]:
            if meal_name.startswith(prefix):
                meal_name = meal_name[len(prefix):].strip()
        return meal_name[:28] or "文字食物记录"

    def _estimate_calories(self, text: str) -> int:
        calories = 320
        if "米饭" in text or "饭" in text:
            calories += 180
        if "面" in text:
            calories += 260
        if "奶茶" in text:
            calories += 300
        if "火锅" in text:
            calories += 500
        if "半" in text:
            calories -= 80
        return max(calories, 120)

    def _estimate_protein(self, text: str) -> int:
        protein = 12
        if any(term in text for term in ["鸡胸", "牛肉", "鱼"]):
            protein += 28
        if any(term in text for term in ["鸡蛋", "蛋白"]):
            protein += 10
        return protein

    def _estimate_carbs(self, text: str) -> int:
        carbs = 25
        if "米饭" in text or "饭" in text:
            carbs += 45
        if "面" in text:
            carbs += 60
        if "奶茶" in text:
            carbs += 45
        if "半" in text:
            carbs -= 15
        return max(carbs, 8)

    def _estimate_fat(self, text: str) -> int:
        fat = 10
        if "火锅" in text:
            fat += 35
        if "牛肉" in text:
            fat += 12
        if "奶茶" in text or "拿铁" in text:
            fat += 10
        return fat

    def _thread_response(self, thread: StoredThread) -> dict:
        data = asdict(thread)
        data["created_at"] = thread.created_at.isoformat()
        data["updated_at"] = thread.updated_at.isoformat()
        data["archived_at"] = thread.archived_at.isoformat() if thread.archived_at else None
        return data

    def _message_response(self, message: StoredMessage) -> dict:
        data = asdict(message)
        data["created_at"] = message.created_at.isoformat()
        return data


chat_service = ChatService()
