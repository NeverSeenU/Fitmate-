from __future__ import annotations

import logging
import time
from typing import Protocol
import uuid

from app.ai.providers.qwen import QwenVisionProvider
from app.ai.providers.xiaomi import XiaomiVisionProvider
from app.ai.schema import (
    FileInsightSchemaError,
    FoodVisionSchemaError,
    WorkoutAnalysisSchemaError,
    validate_file_insights,
    validate_food_batch_analysis,
    validate_food_analysis,
    validate_workout_analysis,
)
from app.config import get_settings
from app.repositories.sqlalchemy.model_calls import StoredAiModelCall


class VisionProvider(Protocol):
    provider_name: str
    model_name: str

    def analyze_food_photo(self, image_bytes: bytes, user_note: str | None = None) -> object:
        ...

    def analyze_food_photos(self, photos: list[dict], user_note: str | None = None) -> object:
        ...


class FileInsightProvider(VisionProvider, Protocol):
    def analyze_food_text(self, text: str) -> object:
        ...

    def analyze_file_text(self, filename: str, content_text: str, content_type: str, user_prompt: str | None = None) -> object:
        ...

    def analyze_workout_text(self, text: str) -> object:
        ...

    def generate_chat_reply(self, text: str, conversation_context: list[dict] | None = None) -> str:
        ...


class ModelCallRepository(Protocol):
    def create(self, call: StoredAiModelCall) -> StoredAiModelCall:
        ...


class FoodVisionUnavailableError(RuntimeError):
    pass


logger = logging.getLogger(__name__)


class FoodVisionRouter:
    def __init__(
        self,
        primary_provider: VisionProvider | None = None,
        fallback_provider: VisionProvider | None = None,
        low_confidence_threshold: float = 0.55,
        model_call_repository: ModelCallRepository | None = None,
    ) -> None:
        settings = get_settings()
        configured_primary, configured_fallback, configured_threshold = self._configured_providers(
            settings.food_vision_provider,
            low_confidence_threshold,
        )
        self.primary_provider = primary_provider or configured_primary
        self.fallback_provider = fallback_provider or configured_fallback
        self.low_confidence_threshold = configured_threshold if primary_provider is None and fallback_provider is None else low_confidence_threshold
        self.model_call_repository = model_call_repository

    def _configured_providers(self, provider_name: str, default_threshold: float) -> tuple[VisionProvider, VisionProvider, float]:
        if provider_name == "xiaomi":
            provider = XiaomiVisionProvider()
            return provider, provider, 0.0
        if provider_name == "qwen":
            provider = QwenVisionProvider()
            return provider, provider, 0.0
        return XiaomiVisionProvider(), QwenVisionProvider(), default_threshold

    def analyze_food_photo(
        self,
        image_bytes: bytes,
        user_note: str | None = None,
        user_id: str | None = None,
    ) -> dict:
        primary_result = self._try_provider_with_retry(self.primary_provider, image_bytes, user_note, user_id)
        if primary_result is not None and primary_result["confidence"] >= self.low_confidence_threshold:
            return primary_result

        fallback_result = self._try_provider_once(
            self.fallback_provider,
            image_bytes,
            user_note,
            user_id,
            purpose="fallback",
        )
        if fallback_result is None:
            if primary_result is not None:
                return primary_result
            raise FoodVisionUnavailableError("all_vision_providers_failed")
        return fallback_result

    def analyze_food_photos(
        self,
        photos: list[dict],
        user_note: str | None = None,
        user_id: str | None = None,
    ) -> dict:
        primary_result = self._try_batch_provider_once(self.primary_provider, photos, user_note, user_id, purpose="food_photo_batch")
        if primary_result is not None:
            return primary_result

        fallback_result = self._try_batch_provider_once(self.fallback_provider, photos, user_note, user_id, purpose="fallback")
        if fallback_result is not None:
            return fallback_result

        food_analyses = [
            self.analyze_food_photo(
                image_bytes=photo["image_bytes"],
                user_note=self._single_photo_note(user_note, index, len(photos)),
                user_id=user_id,
            )
            for index, photo in enumerate(photos)
        ]
        return {
            "food_analyses": food_analyses,
            "groups": [
                {
                    "group_id": str(item.get("meal_name") or f"meal-{index + 1}"),
                    "analysis_indexes": [index],
                    "meal_name": str(item.get("meal_name") or "餐食"),
                }
                for index, item in enumerate(food_analyses)
            ],
        }

    def _try_provider_with_retry(
        self,
        provider: VisionProvider,
        image_bytes: bytes,
        user_note: str | None,
        user_id: str | None,
    ) -> dict | None:
        for _ in range(2):
            result = self._try_provider_once(
                provider,
                image_bytes,
                user_note,
                user_id,
                purpose="food_photo",
            )
            if result is not None:
                return result
        return None

    def _try_provider_once(
        self,
        provider: VisionProvider,
        image_bytes: bytes,
        user_note: str | None,
        user_id: str | None,
        purpose: str,
    ) -> dict | None:
        started = time.perf_counter()
        try:
            raw = provider.analyze_food_photo(image_bytes=image_bytes, user_note=user_note)
            result = validate_food_analysis(raw)
        except FoodVisionSchemaError as exc:
            logger.warning(
                "food vision provider schema error provider=%s model=%s purpose=%s error=%s",
                provider.provider_name,
                provider.model_name,
                purpose,
                exc,
            )
            self._record_model_call(
                provider=provider,
                user_id=user_id,
                purpose=purpose,
                status="error",
                latency_ms=self._latency_ms(started),
                error_code="schema_error",
            )
            return None
        except (RuntimeError, TimeoutError, ValueError) as exc:
            logger.warning(
                "food vision provider error provider=%s model=%s purpose=%s error=%s",
                provider.provider_name,
                provider.model_name,
                purpose,
                str(exc) or exc.__class__.__name__,
            )
            self._record_model_call(
                provider=provider,
                user_id=user_id,
                purpose=purpose,
                status="error",
                latency_ms=self._latency_ms(started),
                error_code=str(exc) or exc.__class__.__name__,
            )
            return None

        result["model_provider"] = provider.provider_name
        result["model_name"] = provider.model_name
        self._record_model_call(
            provider=provider,
            user_id=user_id,
            purpose=purpose,
            status="success",
            latency_ms=self._latency_ms(started),
            estimated_cost_cents=self._estimated_cost_cents(provider.provider_name, purpose),
        )
        return result

    def _try_batch_provider_once(
        self,
        provider: VisionProvider,
        photos: list[dict],
        user_note: str | None,
        user_id: str | None,
        purpose: str,
    ) -> dict | None:
        started = time.perf_counter()
        try:
            raw = provider.analyze_food_photos(photos=photos, user_note=user_note)
            result = validate_food_batch_analysis(raw)
        except FoodVisionSchemaError as exc:
            logger.warning(
                "food vision batch provider schema error provider=%s model=%s purpose=%s error=%s",
                provider.provider_name,
                provider.model_name,
                purpose,
                exc,
            )
            self._record_model_call(
                provider=provider,
                user_id=user_id,
                purpose=purpose,
                status="error",
                latency_ms=self._latency_ms(started),
                error_code="schema_error",
            )
            return None
        except (AttributeError, RuntimeError, TimeoutError, ValueError) as exc:
            logger.warning(
                "food vision batch provider error provider=%s model=%s purpose=%s error=%s",
                provider.provider_name,
                provider.model_name,
                purpose,
                str(exc) or exc.__class__.__name__,
            )
            self._record_model_call(
                provider=provider,
                user_id=user_id,
                purpose=purpose,
                status="error",
                latency_ms=self._latency_ms(started),
                error_code=str(exc) or exc.__class__.__name__,
            )
            return None

        for item in result["food_analyses"]:
            item["model_provider"] = provider.provider_name
            item["model_name"] = provider.model_name
        self._record_model_call(
            provider=provider,
            user_id=user_id,
            purpose=purpose,
            status="success",
            latency_ms=self._latency_ms(started),
            estimated_cost_cents=self._estimated_cost_cents(provider.provider_name, purpose),
        )
        return result

    def _single_photo_note(self, user_note: str | None, index: int, total: int) -> str:
        parts = [
            f"这是用户一次发送的第 {index + 1}/{total} 张食物照片。",
            "请先独立识别这张图。如果它明显和其他图是同一道食物或同一餐的一部分，在 meal_name 和 detected_items 中说清楚；不要把不同照片的食物混在同一张卡里。",
        ]
        if user_note:
            parts.append(f"用户补充：{user_note}")
        return "\n".join(parts)

    def _record_model_call(
        self,
        provider: VisionProvider,
        user_id: str | None,
        purpose: str,
        status: str,
        latency_ms: int,
        estimated_cost_cents: int | None = None,
        error_code: str | None = None,
    ) -> None:
        if self.model_call_repository is None:
            return
        self.model_call_repository.create(
            StoredAiModelCall(
                id=str(uuid.uuid4()),
                user_id=user_id,
                provider=provider.provider_name,
                model_name=provider.model_name,
                purpose=purpose,
                status=status,
                latency_ms=latency_ms,
                estimated_cost_cents=estimated_cost_cents,
                error_code=error_code,
            )
        )

    def _latency_ms(self, started: float) -> int:
        return max(0, int((time.perf_counter() - started) * 1000))

    def _estimated_cost_cents(self, provider_name: str, purpose: str) -> int:
        if provider_name == "qwen" or purpose == "fallback":
            return 2
        return 1


food_vision_router = FoodVisionRouter()


class TextFoodAnalysisRouter:
    def __init__(
        self,
        primary_provider: FileInsightProvider | None = None,
        fallback_provider: FileInsightProvider | None = None,
        model_call_repository: ModelCallRepository | None = None,
    ) -> None:
        self.primary_provider = primary_provider or XiaomiVisionProvider()
        self.fallback_provider = fallback_provider or QwenVisionProvider()
        self.model_call_repository = model_call_repository

    def analyze_food_text(self, text: str, user_id: str | None = None) -> dict | None:
        for provider in (self.primary_provider, self.fallback_provider):
            result = self._try_provider_once(provider=provider, text=text, user_id=user_id)
            if result is not None:
                return result
        return None

    def _try_provider_once(self, provider: FileInsightProvider, text: str, user_id: str | None) -> dict | None:
        started = time.perf_counter()
        try:
            raw = provider.analyze_food_text(text=text)
            result = validate_food_analysis(raw)
        except FoodVisionSchemaError:
            self._record_model_call(provider, user_id, "food_text", "error", self._latency_ms(started), "schema_error")
            return None
        except (RuntimeError, TimeoutError, ValueError) as exc:
            self._record_model_call(provider, user_id, "food_text", "error", self._latency_ms(started), exc.__class__.__name__)
            return None

        result["model_provider"] = provider.provider_name
        result["model_name"] = provider.model_name
        self._record_model_call(provider, user_id, "food_text", "success", self._latency_ms(started))
        return result

    def _record_model_call(
        self,
        provider: FileInsightProvider,
        user_id: str | None,
        purpose: str,
        status: str,
        latency_ms: int,
        error_code: str | None = None,
    ) -> None:
        if self.model_call_repository is None:
            return
        self.model_call_repository.create(
            StoredAiModelCall(
                id=str(uuid.uuid4()),
                user_id=user_id,
                provider=provider.provider_name,
                model_name=provider.model_name,
                purpose=purpose,
                status=status,
                latency_ms=latency_ms,
                estimated_cost_cents=2 if status == "success" else None,
                error_code=error_code,
            )
        )

    def _latency_ms(self, started: float) -> int:
        return max(0, int((time.perf_counter() - started) * 1000))


class ChatReplyRouter:
    def __init__(
        self,
        primary_provider: FileInsightProvider | None = None,
        fallback_provider: FileInsightProvider | None = None,
        model_call_repository: ModelCallRepository | None = None,
    ) -> None:
        self.primary_provider = primary_provider or XiaomiVisionProvider()
        self.fallback_provider = fallback_provider or QwenVisionProvider()
        self.model_call_repository = model_call_repository

    def generate_reply(
        self,
        text: str,
        user_id: str | None = None,
        conversation_context: list[dict] | None = None,
    ) -> dict | None:
        for provider in (self.primary_provider, self.fallback_provider):
            result = self._try_provider_once(provider, text, user_id, conversation_context)
            if result is not None:
                return result
        return None

    def _try_provider_once(
        self,
        provider: FileInsightProvider,
        text: str,
        user_id: str | None,
        conversation_context: list[dict] | None,
    ) -> dict | None:
        started = time.perf_counter()
        try:
            reply = provider.generate_chat_reply(text=text, conversation_context=conversation_context)
        except (RuntimeError, TimeoutError, ValueError):
            self._record_model_call(provider, user_id, "chat_reply", "error", self._latency_ms(started))
            return None
        self._record_model_call(provider, user_id, "chat_reply", "success", self._latency_ms(started))
        return {
            "content_text": reply,
            "model_provider": provider.provider_name,
            "model_name": provider.model_name,
        }

    def _record_model_call(
        self,
        provider: FileInsightProvider,
        user_id: str | None,
        purpose: str,
        status: str,
        latency_ms: int,
    ) -> None:
        if self.model_call_repository is None:
            return
        self.model_call_repository.create(
            StoredAiModelCall(
                id=str(uuid.uuid4()),
                user_id=user_id,
                provider=provider.provider_name,
                model_name=provider.model_name,
                purpose=purpose,
                status=status,
                latency_ms=latency_ms,
                estimated_cost_cents=2 if status == "success" else None,
            )
        )

    def _latency_ms(self, started: float) -> int:
        return max(0, int((time.perf_counter() - started) * 1000))


class FileInsightRouter:
    def __init__(
        self,
        primary_provider: FileInsightProvider | None = None,
        fallback_provider: FileInsightProvider | None = None,
        model_call_repository: ModelCallRepository | None = None,
    ) -> None:
        self.primary_provider = primary_provider or XiaomiVisionProvider()
        self.fallback_provider = fallback_provider or QwenVisionProvider()
        self.model_call_repository = model_call_repository

    def analyze_file_text(
        self,
        filename: str,
        content_text: str,
        content_type: str,
        user_prompt: str | None = None,
        user_id: str | None = None,
    ) -> dict | None:
        for provider in (self.primary_provider, self.fallback_provider):
            result = self._try_provider_once(
                provider=provider,
                filename=filename,
                content_text=content_text,
                content_type=content_type,
                user_prompt=user_prompt,
                user_id=user_id,
            )
            if result is not None:
                return result
        return None

    def _try_provider_once(
        self,
        provider: FileInsightProvider,
        filename: str,
        content_text: str,
        content_type: str,
        user_prompt: str | None,
        user_id: str | None,
    ) -> dict | None:
        started = time.perf_counter()
        try:
            raw = provider.analyze_file_text(filename=filename, content_text=content_text, content_type=content_type, user_prompt=user_prompt)
            result = validate_file_insights(raw)
        except FileInsightSchemaError:
            self._record_model_call(provider, user_id, "file_insight", "error", self._latency_ms(started), "schema_error")
            return None
        except (RuntimeError, TimeoutError, ValueError) as exc:
            self._record_model_call(provider, user_id, "file_insight", "error", self._latency_ms(started), exc.__class__.__name__)
            return None

        result["model_provider"] = provider.provider_name
        result["model_name"] = provider.model_name
        self._record_model_call(provider, user_id, "file_insight", "success", self._latency_ms(started))
        return result

    def _record_model_call(
        self,
        provider: FileInsightProvider,
        user_id: str | None,
        purpose: str,
        status: str,
        latency_ms: int,
        error_code: str | None = None,
    ) -> None:
        if self.model_call_repository is None:
            return
        self.model_call_repository.create(
            StoredAiModelCall(
                id=str(uuid.uuid4()),
                user_id=user_id,
                provider=provider.provider_name,
                model_name=provider.model_name,
                purpose=purpose,
                status=status,
                latency_ms=latency_ms,
                estimated_cost_cents=2 if status == "success" else None,
                error_code=error_code,
            )
        )

    def _latency_ms(self, started: float) -> int:
        return max(0, int((time.perf_counter() - started) * 1000))


class WorkoutAnalysisRouter:
    def __init__(
        self,
        primary_provider: FileInsightProvider | None = None,
        fallback_provider: FileInsightProvider | None = None,
        model_call_repository: ModelCallRepository | None = None,
    ) -> None:
        self.primary_provider = primary_provider or XiaomiVisionProvider()
        self.fallback_provider = fallback_provider or QwenVisionProvider()
        self.model_call_repository = model_call_repository

    def analyze_workout_text(self, text: str, user_id: str | None = None) -> dict | None:
        for provider in (self.primary_provider, self.fallback_provider):
            result = self._try_provider_once(provider=provider, text=text, user_id=user_id)
            if result is not None:
                return result
        return None

    def _try_provider_once(self, provider: FileInsightProvider, text: str, user_id: str | None) -> dict | None:
        started = time.perf_counter()
        try:
            raw = provider.analyze_workout_text(text=text)
            result = validate_workout_analysis(raw)
        except WorkoutAnalysisSchemaError:
            self._record_model_call(provider, user_id, "workout_analysis", "error", self._latency_ms(started), "schema_error")
            return None
        except (RuntimeError, TimeoutError, ValueError) as exc:
            self._record_model_call(provider, user_id, "workout_analysis", "error", self._latency_ms(started), exc.__class__.__name__)
            return None

        result["model_provider"] = provider.provider_name
        result["model_name"] = provider.model_name
        self._record_model_call(provider, user_id, "workout_analysis", "success", self._latency_ms(started))
        return result

    def _record_model_call(
        self,
        provider: FileInsightProvider,
        user_id: str | None,
        purpose: str,
        status: str,
        latency_ms: int,
        error_code: str | None = None,
    ) -> None:
        if self.model_call_repository is None:
            return
        self.model_call_repository.create(
            StoredAiModelCall(
                id=str(uuid.uuid4()),
                user_id=user_id,
                provider=provider.provider_name,
                model_name=provider.model_name,
                purpose=purpose,
                status=status,
                latency_ms=latency_ms,
                estimated_cost_cents=2 if status == "success" else None,
                error_code=error_code,
            )
        )

    def _latency_ms(self, started: float) -> int:
        return max(0, int((time.perf_counter() - started) * 1000))
