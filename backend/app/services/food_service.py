from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import date, datetime, timezone
from typing import Any
import uuid

from app.services.chat_service import StoredMessage, chat_service
from app.services.subscription_service import subscription_service
from app.storage.local import LocalObjectStorage
from app.storage.protocols import ObjectStorage


@dataclass
class StoredFoodLog:
    id: str
    user_id: str
    source_message_id: str | None
    image_object_key: str | None
    meal_name: str
    calories_range_kcal: list[int | float]
    protein_g_range: list[int | float]
    carbs_g_range: list[int | float]
    fat_g_range: list[int | float]
    confidence: float
    status: str
    needs_follow_up: bool
    follow_up_question: str | None
    user_portion_note: str | None = None
    model_provider: str | None = None
    model_name: str | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


class InMemoryFoodLogStore:
    def __init__(self) -> None:
        self.logs_by_id: dict[str, StoredFoodLog] = {}

    def create(self, log: StoredFoodLog) -> StoredFoodLog:
        self.logs_by_id[log.id] = log
        return log

    def get_for_user(self, user_id: str, food_log_id: str) -> StoredFoodLog | None:
        log = self.logs_by_id.get(food_log_id)
        if log is None or log.user_id != user_id:
            return None
        return log

    def list_for_user(self, user_id: str, target_date: date | None = None) -> list[StoredFoodLog]:
        logs = [log for log in self.logs_by_id.values() if log.user_id == user_id]
        if target_date is not None:
            logs = [log for log in logs if log.created_at.date() == target_date]
        return sorted(logs, key=lambda log: log.created_at, reverse=True)

    def save(self, log: StoredFoodLog) -> StoredFoodLog:
        log.updated_at = datetime.now(timezone.utc)
        self.logs_by_id[log.id] = log
        return log


class FoodService:
    def __init__(
        self,
        store: InMemoryFoodLogStore | None = None,
        chat_service_dependency: Any | None = None,
        subscription_service_dependency: Any | None = None,
        storage: ObjectStorage | None = None,
    ) -> None:
        self.store = store or InMemoryFoodLogStore()
        self.chat_service = chat_service_dependency or chat_service
        self.subscription_service = subscription_service_dependency or subscription_service
        self.storage = storage or LocalObjectStorage()

    def analyze_photo(
        self,
        user_id: str,
        thread_id: str,
        image_bytes: bytes,
        image_filename: str,
        user_note: str | None,
        vision_router: Any,
    ) -> dict | None:
        thread = self.chat_service.store.get_thread(user_id, thread_id)
        if thread is None:
            return None

        image_object_key = self._object_key(user_id, image_filename)
        stored_image = self.storage.put(
            key=image_object_key,
            content=image_bytes,
            content_type=self._content_type(image_filename),
        )
        image_message = self.chat_service.store.add_message(
            StoredMessage(
                id=str(uuid.uuid4()),
                thread_id=thread_id,
                user_id=user_id,
                role="user",
                message_type="image",
                content_text=user_note,
                image_object_key=stored_image.object_key,
                structured_json={"image_object_key": stored_image.object_key},
            )
        )
        analysis = vision_router.analyze_food_photo(
            image_bytes=image_bytes,
            user_note=user_note,
            user_id=user_id,
        )
        subscription = self.subscription_service.get_current(user_id)
        should_auto_record = bool(subscription["entitlements"]["automatic_recording"])

        food_log = None
        if should_auto_record:
            food_log = self.store.create(
                StoredFoodLog(
                    id=str(uuid.uuid4()),
                    user_id=user_id,
                    source_message_id=image_message.id,
                    image_object_key=stored_image.object_key,
                    meal_name=analysis["meal_name"],
                    calories_range_kcal=analysis["calories_range_kcal"],
                    protein_g_range=analysis["protein_g_range"],
                    carbs_g_range=analysis["carbs_g_range"],
                    fat_g_range=analysis["fat_g_range"],
                    confidence=float(analysis["confidence"]),
                    status="pending",
                    needs_follow_up=bool(analysis["needs_follow_up"]),
                    follow_up_question=analysis["follow_up_question"],
                    model_provider=analysis.get("model_provider"),
                    model_name=analysis.get("model_name"),
                )
            )

        assistant_message = self.chat_service.store.add_message(
            StoredMessage(
                id=str(uuid.uuid4()),
                thread_id=thread_id,
                user_id=user_id,
                role="assistant",
                message_type="food_analysis",
                content_text=analysis["supportive_reply"],
                structured_json={"food_analysis": analysis},
                model_provider=analysis.get("model_provider"),
                model_name=analysis.get("model_name"),
            )
        )
        return {
            "assistant_message": self.chat_service._message_response(assistant_message),
            "food_analysis": self._analysis_response(analysis, food_log),
        }

    def list_logs(self, user_id: str, target_date: date | None = None) -> dict:
        return {
            "food_logs": [
                self._log_response(log)
                for log in self.store.list_for_user(user_id, target_date)
            ]
        }

    def confirm(self, user_id: str, food_log_id: str) -> dict | None:
        log = self.store.get_for_user(user_id, food_log_id)
        if log is None:
            return None
        log.status = "confirmed"
        return self._log_response(self.store.save(log))

    def patch(self, user_id: str, food_log_id: str, data: dict[str, Any]) -> dict | None:
        log = self.store.get_for_user(user_id, food_log_id)
        if log is None:
            return None
        for key in ["meal_name", "user_portion_note"]:
            if key in data:
                setattr(log, key, data[key])
        for key in ["calories_range_kcal", "protein_g_range", "carbs_g_range", "fat_g_range"]:
            if key in data:
                setattr(log, key, data[key])
        log.status = "edited"
        return self._log_response(self.store.save(log))

    def discard(self, user_id: str, food_log_id: str) -> dict | None:
        log = self.store.get_for_user(user_id, food_log_id)
        if log is None:
            return None
        log.status = "discarded"
        return self._log_response(self.store.save(log))

    def delete_user_photos(self, user_id: str) -> int:
        deleted_count = 0
        for log in self.store.list_for_user(user_id):
            if log.image_object_key and self.storage.delete(log.image_object_key):
                deleted_count += 1
        return deleted_count

    def _analysis_response(self, analysis: dict, food_log: StoredFoodLog | None) -> dict:
        return {
            "food_log_id": food_log.id if food_log else None,
            "meal_name": analysis["meal_name"],
            "calories_range_kcal": analysis["calories_range_kcal"],
            "protein_g_range": analysis["protein_g_range"],
            "carbs_g_range": analysis["carbs_g_range"],
            "fat_g_range": analysis["fat_g_range"],
            "confidence": analysis["confidence"],
            "status": food_log.status if food_log else "analysis_only",
            "needs_follow_up": analysis["needs_follow_up"],
            "follow_up_question": analysis["follow_up_question"],
            "model_provider": analysis.get("model_provider"),
            "model_name": analysis.get("model_name"),
        }

    def _log_response(self, log: StoredFoodLog) -> dict:
        data = asdict(log)
        data["created_at"] = log.created_at.isoformat()
        data["updated_at"] = log.updated_at.isoformat()
        return data

    def _object_key(self, user_id: str, filename: str) -> str:
        safe_filename = filename or "food-photo.jpg"
        return f"food-photos/{user_id}/{uuid.uuid4()}-{safe_filename}"

    def _content_type(self, filename: str) -> str:
        if filename.lower().endswith(".png"):
            return "image/png"
        if filename.lower().endswith(".webp"):
            return "image/webp"
        return "image/jpeg"


food_service = FoodService()
