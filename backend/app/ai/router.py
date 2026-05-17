from __future__ import annotations

import time
from typing import Protocol
import uuid

from app.ai.providers.qwen import QwenVisionProvider
from app.ai.providers.xiaomi import XiaomiVisionProvider
from app.ai.schema import FoodVisionSchemaError, validate_food_analysis
from app.repositories.sqlalchemy.model_calls import StoredAiModelCall


class VisionProvider(Protocol):
    provider_name: str
    model_name: str

    def analyze_food_photo(self, image_bytes: bytes, user_note: str | None = None) -> object:
        ...


class ModelCallRepository(Protocol):
    def create(self, call: StoredAiModelCall) -> StoredAiModelCall:
        ...


class FoodVisionUnavailableError(RuntimeError):
    pass


class FoodVisionRouter:
    def __init__(
        self,
        primary_provider: VisionProvider | None = None,
        fallback_provider: VisionProvider | None = None,
        low_confidence_threshold: float = 0.55,
        model_call_repository: ModelCallRepository | None = None,
    ) -> None:
        self.primary_provider = primary_provider or XiaomiVisionProvider()
        self.fallback_provider = fallback_provider or QwenVisionProvider()
        self.low_confidence_threshold = low_confidence_threshold
        self.model_call_repository = model_call_repository

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
        except FoodVisionSchemaError:
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
            self._record_model_call(
                provider=provider,
                user_id=user_id,
                purpose=purpose,
                status="error",
                latency_ms=self._latency_ms(started),
                error_code=exc.__class__.__name__,
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
