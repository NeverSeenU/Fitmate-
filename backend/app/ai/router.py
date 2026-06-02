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

    def generate_chat_reply(self, text: str, conversation_context: list[dict] | None = None, structured_context: dict | None = None) -> str:
        ...


class ModelCallRepository(Protocol):
    def create(self, call: StoredAiModelCall) -> StoredAiModelCall:
        ...


class FoodVisionUnavailableError(RuntimeError):
    def __init__(self, error_code: str = "vision_provider_unavailable") -> None:
        super().__init__(error_code)
        self.error_code = error_code


logger = logging.getLogger(__name__)


def provider_error_code(exc: BaseException) -> str:
    message = str(exc) or exc.__class__.__name__
    if "not_configured" in message:
        return "provider_not_configured"
    if isinstance(exc, TimeoutError) or "timeout" in message.lower():
        return "provider_timeout"
    if "provider_network_error" in message:
        return "provider_network_error"
    if "provider_http_401" in message or "provider_http_403" in message:
        return "provider_auth_failed"
    if "provider_http_429" in message:
        return "provider_rate_limited"
    if "provider_http_" in message:
        return "provider_http_error"
    if "provider_response" in message or "provider_returned_invalid_json" in message:
        return "provider_invalid_response"
    return exc.__class__.__name__


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
        primary_result, primary_error = self._try_provider_with_retry(self.primary_provider, image_bytes, user_note, user_id)
        if primary_result is not None and primary_result["confidence"] >= self.low_confidence_threshold:
            return primary_result

        fallback_result, fallback_error = self._try_provider_once(
            self.fallback_provider,
            image_bytes,
            user_note,
            user_id,
            purpose="fallback",
        )
        if fallback_result is None:
            if primary_result is not None:
                primary_result["fallback_used"] = False
                primary_result["fallback_source"] = "low_confidence_primary"
                return primary_result
            raise FoodVisionUnavailableError(self._most_actionable_error([primary_error, fallback_error]))
        fallback_result["fallback_used"] = True
        fallback_result["fallback_source"] = "low_confidence_primary" if primary_result is not None else primary_error
        return fallback_result

    def analyze_food_photos(
        self,
        photos: list[dict],
        user_note: str | None = None,
        user_id: str | None = None,
    ) -> dict:
        primary_result, primary_error = self._try_batch_provider_once(self.primary_provider, photos, user_note, user_id, purpose="food_photo_batch")
        if primary_result is not None:
            return primary_result

        fallback_result, fallback_error = self._try_batch_provider_once(self.fallback_provider, photos, user_note, user_id, purpose="fallback")
        if fallback_result is not None:
            fallback_result["fallback_used"] = True
            fallback_result["fallback_source"] = primary_error
            for item in fallback_result["food_analyses"]:
                item["fallback_used"] = True
                item["fallback_source"] = primary_error
            return fallback_result

        if not self._should_try_sequential_photo_fallback(primary_error, fallback_error):
            raise FoodVisionUnavailableError(self._most_actionable_error([primary_error, fallback_error]))

        try:
            food_analyses = [
                self.analyze_food_photo(
                    image_bytes=photo["image_bytes"],
                    user_note=self._single_photo_note(user_note, index, len(photos)),
                    user_id=user_id,
                )
                for index, photo in enumerate(photos)
            ]
        except FoodVisionUnavailableError as exc:
            raise FoodVisionUnavailableError(self._most_actionable_error([primary_error, fallback_error, exc.error_code])) from exc
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

    def _should_try_sequential_photo_fallback(self, primary_error: str | None, fallback_error: str | None) -> bool:
        errors = {error for error in (primary_error, fallback_error) if error}
        return bool(errors) and errors.issubset({"AttributeError"})

    def _try_provider_with_retry(
        self,
        provider: VisionProvider,
        image_bytes: bytes,
        user_note: str | None,
        user_id: str | None,
    ) -> tuple[dict | None, str | None]:
        last_error = None
        for _ in range(2):
            result, error_code = self._try_provider_once(
                provider,
                image_bytes,
                user_note,
                user_id,
                purpose="food_photo",
            )
            if result is not None:
                return result, None
            last_error = error_code
        return None, last_error

    def _try_provider_once(
        self,
        provider: VisionProvider,
        image_bytes: bytes,
        user_note: str | None,
        user_id: str | None,
        purpose: str,
    ) -> tuple[dict | None, str | None]:
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
            return None, "schema_error"
        except (RuntimeError, TimeoutError, ValueError) as exc:
            error_code = provider_error_code(exc)
            logger.warning(
                "food vision provider error provider=%s model=%s purpose=%s error=%s",
                provider.provider_name,
                provider.model_name,
                purpose,
                error_code,
            )
            self._record_model_call(
                provider=provider,
                user_id=user_id,
                purpose=purpose,
                status="error",
                latency_ms=self._latency_ms(started),
                error_code=error_code,
            )
            return None, error_code

        latency_ms = self._latency_ms(started)
        result["model_provider"] = provider.provider_name
        result["model_name"] = provider.model_name
        result["provider_latency_ms"] = latency_ms
        result["fallback_used"] = purpose == "fallback"
        result["analysis_source"] = "ai"
        self._record_model_call(
            provider=provider,
            user_id=user_id,
            purpose=purpose,
            status="success",
            latency_ms=latency_ms,
            estimated_cost_cents=self._estimated_cost_cents(provider.provider_name, purpose),
        )
        return result, None

    def _try_batch_provider_once(
        self,
        provider: VisionProvider,
        photos: list[dict],
        user_note: str | None,
        user_id: str | None,
        purpose: str,
    ) -> tuple[dict | None, str | None]:
        started = time.perf_counter()
        try:
            raw = provider.analyze_food_photos(photos=photos, user_note=user_note)
            result = validate_food_batch_analysis(raw, photo_count=len(photos))
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
            return None, "schema_error"
        except (AttributeError, RuntimeError, TimeoutError, ValueError) as exc:
            error_code = provider_error_code(exc)
            logger.warning(
                "food vision batch provider error provider=%s model=%s purpose=%s error=%s",
                provider.provider_name,
                provider.model_name,
                purpose,
                error_code,
            )
            self._record_model_call(
                provider=provider,
                user_id=user_id,
                purpose=purpose,
                status="error",
                latency_ms=self._latency_ms(started),
                error_code=error_code,
            )
            return None, error_code

        latency_ms = self._latency_ms(started)
        for item in result["food_analyses"]:
            item["model_provider"] = provider.provider_name
            item["model_name"] = provider.model_name
            item["provider_latency_ms"] = latency_ms
            item["fallback_used"] = purpose == "fallback"
            item["analysis_source"] = "ai"
        result["performance"] = {
            "provider": provider.provider_name,
            "model_name": provider.model_name,
            "provider_latency_ms": latency_ms,
            "fallback_used": purpose == "fallback",
        }
        self._record_model_call(
            provider=provider,
            user_id=user_id,
            purpose=purpose,
            status="success",
            latency_ms=latency_ms,
            estimated_cost_cents=self._estimated_cost_cents(provider.provider_name, purpose),
        )
        return result, None

    def _most_actionable_error(self, errors: list[str | None]) -> str:
        present = [error for error in errors if error]
        for candidate in [
            "provider_not_configured",
            "provider_auth_failed",
            "provider_rate_limited",
            "provider_timeout",
            "provider_network_error",
            "schema_error",
            "provider_invalid_response",
            "provider_http_error",
        ]:
            if candidate in present:
                return candidate
        return present[-1] if present else "vision_provider_unavailable"

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
        self.last_error_code: str | None = None

    def analyze_food_text(self, text: str, user_id: str | None = None) -> dict | None:
        self.last_error_code = None
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
            self.last_error_code = "schema_error"
            self._record_model_call(provider, user_id, "food_text", "error", self._latency_ms(started), "schema_error")
            return None
        except (RuntimeError, TimeoutError, ValueError) as exc:
            error_code = provider_error_code(exc)
            self.last_error_code = error_code
            self._record_model_call(provider, user_id, "food_text", "error", self._latency_ms(started), error_code)
            return None

        result["model_provider"] = provider.provider_name
        result["model_name"] = provider.model_name
        result["fallback_used"] = False
        result["analysis_source"] = "ai"
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
        structured_context: dict | None = None,
    ) -> dict | None:
        for provider in (self.primary_provider, self.fallback_provider):
            result = self._try_provider_once(provider, text, user_id, conversation_context, structured_context)
            if result is not None:
                return result
        return None

    def _try_provider_once(
        self,
        provider: FileInsightProvider,
        text: str,
        user_id: str | None,
        conversation_context: list[dict] | None,
        structured_context: dict | None,
    ) -> dict | None:
        started = time.perf_counter()
        try:
            reply = provider.generate_chat_reply(text=text, conversation_context=conversation_context, structured_context=structured_context)
        except (RuntimeError, TimeoutError, ValueError) as exc:
            self._record_model_call(provider, user_id, "chat_reply", "error", self._latency_ms(started), provider_error_code(exc))
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
        self.last_error_code: str | None = None

    def analyze_file_text(
        self,
        filename: str,
        content_text: str,
        content_type: str,
        user_prompt: str | None = None,
        user_id: str | None = None,
    ) -> dict | None:
        self.last_error_code = None
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
            self.last_error_code = "schema_error"
            self._record_model_call(provider, user_id, "file_insight", "error", self._latency_ms(started), "schema_error")
            return None
        except (RuntimeError, TimeoutError, ValueError) as exc:
            error_code = provider_error_code(exc)
            self.last_error_code = error_code
            self._record_model_call(provider, user_id, "file_insight", "error", self._latency_ms(started), error_code)
            return None

        result["model_provider"] = provider.provider_name
        result["model_name"] = provider.model_name
        result["fallback_used"] = False
        result["analysis_source"] = "ai"
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
        self.last_error_code: str | None = None

    def analyze_workout_text(self, text: str, user_id: str | None = None) -> dict | None:
        self.last_error_code = None
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
            self.last_error_code = "schema_error"
            self._record_model_call(provider, user_id, "workout_analysis", "error", self._latency_ms(started), "schema_error")
            return None
        except (RuntimeError, TimeoutError, ValueError) as exc:
            error_code = provider_error_code(exc)
            self.last_error_code = error_code
            self._record_model_call(provider, user_id, "workout_analysis", "error", self._latency_ms(started), error_code)
            return None

        result["model_provider"] = provider.provider_name
        result["model_name"] = provider.model_name
        result["fallback_used"] = False
        result["analysis_source"] = "ai"
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
