from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import date, datetime, timezone
from typing import Any
import uuid
import re
import time

from app.services.chat_service import StoredMessage, chat_service
from app.services.subscription_service import subscription_service
from app.services.usage_service import usage_service
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

    def delete(self, user_id: str, food_log_id: str) -> bool:
        log = self.get_for_user(user_id, food_log_id)
        if log is None:
            return False
        del self.logs_by_id[food_log_id]
        return True


class FoodService:
    def __init__(
        self,
        store: InMemoryFoodLogStore | None = None,
        chat_service_dependency: Any | None = None,
        subscription_service_dependency: Any | None = None,
        usage_service_dependency: Any | None = None,
        storage: ObjectStorage | None = None,
    ) -> None:
        self.store = store or InMemoryFoodLogStore()
        self.chat_service = chat_service_dependency or chat_service
        self.subscription_service = subscription_service_dependency or subscription_service
        self.usage_service = usage_service_dependency or usage_service
        self.storage = storage or LocalObjectStorage()

    def analyze_photo(
        self,
        user_id: str,
        thread_id: str,
        image_bytes: bytes,
        image_filename: str,
        image_content_type: str,
        user_note: str | None,
        vision_router: Any,
    ) -> dict | None:
        thread = self.chat_service.store.get_thread(user_id, thread_id)
        if thread is None:
            return None

        self.usage_service.ensure_allowed(user_id, "food_photo")
        image_object_key = self._object_key(user_id, image_filename)
        stored_image = self.storage.put(
            key=image_object_key,
            content=image_bytes,
            content_type=image_content_type,
        )
        started = time.perf_counter()
        try:
            analysis = vision_router.analyze_food_photo(
                image_bytes=image_bytes,
                user_note=user_note,
                user_id=user_id,
            )
        except Exception:
            self.storage.delete(stored_image.object_key)
            raise

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
        self.usage_service.increment(user_id, "food_photo")
        return {
            "assistant_message": self.chat_service._message_response(assistant_message),
            "food_analysis": self._analysis_response(analysis, food_log, request_latency_ms=self._latency_ms(started)),
        }

    def analyze_photos(
        self,
        user_id: str,
        thread_id: str,
        photos: list[dict[str, Any]],
        user_note: str | None,
        vision_router: Any,
    ) -> dict | None:
        thread = self.chat_service.store.get_thread(user_id, thread_id)
        if thread is None:
            return None

        for _ in photos:
            self.usage_service.ensure_allowed(user_id, "food_photo")
        stored_images = [
            self.storage.put(
                key=self._object_key(user_id, photo["image_filename"]),
                content=photo["image_bytes"],
                content_type=photo["image_content_type"],
            )
            for photo in photos
        ]
        started = time.perf_counter()
        try:
            batch = vision_router.analyze_food_photos(
                photos=photos,
                user_note=user_note,
                user_id=user_id,
            )
        except Exception:
            for stored_image in stored_images:
                self.storage.delete(stored_image.object_key)
            raise

        image_message = self.chat_service.store.add_message(
            StoredMessage(
                id=str(uuid.uuid4()),
                thread_id=thread_id,
                user_id=user_id,
                role="user",
                message_type="image_batch",
                content_text=user_note,
                image_object_key=stored_images[0].object_key if stored_images else None,
                structured_json={
                    "images": [
                        {
                            "image_object_key": stored_image.object_key,
                            "content_type": stored_image.content_type,
                            "size_bytes": stored_image.size_bytes,
                        }
                        for stored_image in stored_images
                    ],
                },
            )
        )
        subscription = self.subscription_service.get_current(user_id)
        should_auto_record = bool(subscription["entitlements"]["automatic_recording"])

        food_analyses = []
        assistant_messages = []
        groups = batch.get("groups") or self._analysis_groups(batch["food_analyses"])
        for analysis_index, analysis in enumerate(batch["food_analyses"]):
            group = self._group_for_analysis(groups, analysis_index)
            source_photo_indexes = self._source_photo_indexes(group, analysis_index, len(stored_images))
            source_images = self._source_images(stored_images, photos, source_photo_indexes)
            image_index = source_photo_indexes[0] if source_photo_indexes else min(analysis_index, len(stored_images) - 1)
            enriched_analysis = {
                **analysis,
                "source_group": group,
                "source_photo_indexes": source_photo_indexes,
                "source_images": source_images,
            }
            food_log = None
            if should_auto_record:
                food_log = self.store.create(
                    StoredFoodLog(
                        id=str(uuid.uuid4()),
                        user_id=user_id,
                        source_message_id=image_message.id,
                        image_object_key=stored_images[image_index].object_key if stored_images else None,
                        meal_name=enriched_analysis["meal_name"],
                        calories_range_kcal=enriched_analysis["calories_range_kcal"],
                        protein_g_range=enriched_analysis["protein_g_range"],
                        carbs_g_range=enriched_analysis["carbs_g_range"],
                        fat_g_range=enriched_analysis["fat_g_range"],
                        confidence=float(enriched_analysis["confidence"]),
                        status="pending",
                        needs_follow_up=bool(enriched_analysis["needs_follow_up"]),
                        follow_up_question=enriched_analysis["follow_up_question"],
                        model_provider=enriched_analysis.get("model_provider"),
                        model_name=enriched_analysis.get("model_name"),
                    )
                )

            assistant_message = self.chat_service.store.add_message(
                StoredMessage(
                    id=str(uuid.uuid4()),
                    thread_id=thread_id,
                    user_id=user_id,
                    role="assistant",
                    message_type="food_analysis",
                    content_text=enriched_analysis["supportive_reply"],
                    structured_json={"food_analysis": enriched_analysis, "group": group},
                    model_provider=enriched_analysis.get("model_provider"),
                    model_name=enriched_analysis.get("model_name"),
                )
            )
            food_analyses.append(self._analysis_response(enriched_analysis, food_log, request_latency_ms=self._latency_ms(started)))
            assistant_messages.append(self.chat_service._message_response(assistant_message))
        for _ in photos:
            self.usage_service.increment(user_id, "food_photo")

        return {
            "food_analyses": food_analyses,
            "assistant_messages": assistant_messages,
            "groups": groups,
            "performance": {
                **(batch.get("performance") or {}),
                "request_latency_ms": self._latency_ms(started),
                "photo_count": len(photos),
                "analysis_count": len(food_analyses),
            },
        }

    def list_logs(self, user_id: str, target_date: date | None = None) -> dict:
        return {
            "food_logs": [
                self._log_response(log)
                for log in self.store.list_for_user(user_id, target_date)
            ]
        }

    def create_log(self, user_id: str, data: dict[str, Any]) -> dict:
        log = self.store.create(
            StoredFoodLog(
                id=str(uuid.uuid4()),
                user_id=user_id,
                source_message_id=None,
                image_object_key=None,
                meal_name=data["meal_name"],
                calories_range_kcal=data.get("calories_range_kcal") or [0, 0],
                protein_g_range=data.get("protein_g_range") or [0, 0],
                carbs_g_range=data.get("carbs_g_range") or [0, 0],
                fat_g_range=data.get("fat_g_range") or [0, 0],
                confidence=float(data.get("confidence", 1.0)),
                status=data.get("status", "confirmed"),
                needs_follow_up=False,
                follow_up_question=None,
                user_portion_note=data.get("user_portion_note"),
                model_provider=data.get("model_provider"),
                model_name=data.get("model_name"),
            )
        )
        return self._log_response(log)

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

    def delete(self, user_id: str, food_log_id: str) -> bool:
        return self.store.delete(user_id, food_log_id)

    def delete_user_photos(self, user_id: str) -> int:
        deleted_count = 0
        for log in self.store.list_for_user(user_id):
            if log.image_object_key and self.storage.delete(log.image_object_key):
                deleted_count += 1
        return deleted_count

    def _analysis_response(self, analysis: dict, food_log: StoredFoodLog | None, request_latency_ms: int | None = None) -> dict:
        return {
            "food_log_id": food_log.id if food_log else None,
            "meal_name": analysis["meal_name"],
            "detected_items": analysis.get("detected_items", []),
            "calories_range_kcal": analysis["calories_range_kcal"],
            "protein_g_range": analysis["protein_g_range"],
            "carbs_g_range": analysis["carbs_g_range"],
            "fat_g_range": analysis["fat_g_range"],
            "confidence": analysis["confidence"],
            "status": food_log.status if food_log else "analysis_only",
            "needs_follow_up": analysis["needs_follow_up"],
            "follow_up_question": analysis["follow_up_question"],
            "fat_loss_advice": analysis.get("fat_loss_advice"),
            "model_provider": analysis.get("model_provider"),
            "model_name": analysis.get("model_name"),
            "provider_latency_ms": analysis.get("provider_latency_ms"),
            "request_latency_ms": request_latency_ms,
            "source_group": analysis.get("source_group"),
            "source_photo_indexes": analysis.get("source_photo_indexes"),
            "source_images": analysis.get("source_images"),
            "fallback_used": analysis.get("fallback_used", False),
            "fallback_source": analysis.get("fallback_source"),
            "analysis_source": analysis.get("analysis_source"),
        }

    def _log_response(self, log: StoredFoodLog) -> dict:
        data = asdict(log)
        data["created_at"] = log.created_at.isoformat()
        data["updated_at"] = log.updated_at.isoformat()
        return data

    def _object_key(self, user_id: str, filename: str) -> str:
        safe_filename = filename or "food-photo.jpg"
        return f"food-photos/{user_id}/{uuid.uuid4()}-{safe_filename}"

    def _batch_photo_note(self, user_note: str | None, index: int, total: int) -> str:
        parts = [
            f"这是用户一次发送的第 {index + 1}/{total} 张食物照片。",
            "请先独立识别这张图。如果它明显和其他图是同一道食物或同一餐的一部分，在 meal_name 和 detected_items 中说清楚；不要把不同照片的食物混在同一张卡里。",
        ]
        if user_note:
            parts.append(f"用户补充：{user_note}")
        return "\n".join(parts)

    def _analysis_groups(self, analyses: list[dict]) -> list[dict]:
        groups: list[dict] = []
        by_key: dict[str, int] = {}
        for index, analysis in enumerate(analyses):
            key = self._analysis_group_key(analysis)
            group_index = by_key.get(key)
            if group_index is None:
                by_key[key] = len(groups)
                groups.append({
                    "group_id": key or f"group-{index + 1}",
                    "analysis_indexes": [index],
                    "source_photo_indexes": [index],
                    "meal_name": analysis.get("meal_name") or "餐食",
                })
            else:
                groups[group_index]["analysis_indexes"].append(index)
                groups[group_index]["source_photo_indexes"].append(index)
        return groups

    def _analysis_group_key(self, analysis: dict) -> str:
        title = str(analysis.get("meal_name") or "").lower()
        key = re.sub(r"[^\w\u4e00-\u9fff]+", "", title)
        if key:
            return key
        return "|".join(str(item).lower() for item in analysis.get("detected_items") or [])

    def _group_for_analysis(self, groups: list[dict], analysis_index: int) -> dict | None:
        for group in groups:
            if analysis_index in group.get("analysis_indexes", []):
                return group
        return None

    def _source_photo_indexes(self, group: dict | None, analysis_index: int, photo_count: int) -> list[int]:
        if photo_count <= 0:
            return []
        raw_indexes = group.get("source_photo_indexes") if group else None
        if not isinstance(raw_indexes, list):
            raw_indexes = group.get("analysis_indexes") if group else None
        indexes = [
            int(item)
            for item in (raw_indexes if isinstance(raw_indexes, list) else [analysis_index])
            if isinstance(item, int) and not isinstance(item, bool) and 0 <= item < photo_count
        ]
        if not indexes:
            indexes = [min(analysis_index, photo_count - 1)]
        return sorted(set(indexes))

    def _source_images(self, stored_images: list[Any], photos: list[dict[str, Any]], indexes: list[int]) -> list[dict[str, Any]]:
        source_images = []
        for index in indexes:
            if index >= len(stored_images) or index >= len(photos):
                continue
            source_images.append({
                "index": index,
                "image_object_key": stored_images[index].object_key,
                "filename": photos[index].get("image_filename"),
                "content_type": stored_images[index].content_type,
                "size_bytes": stored_images[index].size_bytes,
            })
        return source_images

    def _latency_ms(self, started: float) -> int:
        return max(0, int((time.perf_counter() - started) * 1000))


food_service = FoodService()
