from app.ai.router import FoodVisionRouter
from app.repositories.sqlalchemy.model_calls import StoredAiModelCall


VALID_ANALYSIS = {
    "meal_name": "bibimbap",
    "detected_items": ["rice", "egg", "vegetables", "sauce"],
    "calories_range_kcal": [600, 900],
    "protein_g_range": [25, 40],
    "carbs_g_range": [70, 100],
    "fat_g_range": [18, 35],
    "confidence": 0.72,
    "needs_follow_up": False,
    "follow_up_question": None,
    "fat_loss_advice": "Keep the next meal lighter on oil and starch.",
    "supportive_reply": "Log the range first; one meal is manageable.",
    "safety_flags": [],
}


class FakeProvider:
    def __init__(self, provider_name: str, model_name: str, responses: list[object]) -> None:
        self.provider_name = provider_name
        self.model_name = model_name
        self.responses = responses
        self.calls = 0

    def analyze_food_photo(self, image_bytes: bytes, user_note: str | None = None) -> object:
        self.calls += 1
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


class InMemoryModelCallRepository:
    def __init__(self) -> None:
        self.calls: list[StoredAiModelCall] = []

    def create(self, call: StoredAiModelCall) -> StoredAiModelCall:
        self.calls.append(call)
        return call


def test_xiaomi_success_returns_normalized_food_analysis_and_logs_usage() -> None:
    xiaomi = FakeProvider("xiaomi", "mimo-v2-omni", [VALID_ANALYSIS])
    qwen = FakeProvider("qwen", "qwen3-vl-plus", [VALID_ANALYSIS])
    model_calls = InMemoryModelCallRepository()
    router = FoodVisionRouter(
        primary_provider=xiaomi,
        fallback_provider=qwen,
        model_call_repository=model_calls,
    )

    result = router.analyze_food_photo(
        b"image",
        user_note="training dinner",
        user_id="11111111-1111-1111-1111-111111111111",
    )

    assert result["meal_name"] == "bibimbap"
    assert result["model_provider"] == "xiaomi"
    assert result["model_name"] == "mimo-v2-omni"
    assert result["calories_range_kcal"] == [600, 900]
    assert qwen.calls == 0
    assert len(model_calls.calls) == 1
    assert model_calls.calls[0].user_id == "11111111-1111-1111-1111-111111111111"
    assert model_calls.calls[0].provider == "xiaomi"
    assert model_calls.calls[0].model_name == "mimo-v2-omni"
    assert model_calls.calls[0].purpose == "food_photo"
    assert model_calls.calls[0].status == "success"
    assert model_calls.calls[0].latency_ms is not None
    assert model_calls.calls[0].estimated_cost_cents == 1


def test_xiaomi_invalid_json_retries_once_and_logs_error_then_success() -> None:
    xiaomi = FakeProvider("xiaomi", "mimo-v2-omni", [{"meal_name": "bad"}, VALID_ANALYSIS])
    qwen = FakeProvider("qwen", "qwen3-vl-plus", [VALID_ANALYSIS])
    model_calls = InMemoryModelCallRepository()
    router = FoodVisionRouter(
        primary_provider=xiaomi,
        fallback_provider=qwen,
        model_call_repository=model_calls,
    )

    result = router.analyze_food_photo(b"image")

    assert xiaomi.calls == 2
    assert qwen.calls == 0
    assert result["model_provider"] == "xiaomi"
    assert [call.status for call in model_calls.calls] == ["error", "success"]
    assert model_calls.calls[0].error_code == "schema_error"


def test_qwen_fallback_when_xiaomi_fails_twice_logs_fallback_usage() -> None:
    xiaomi = FakeProvider("xiaomi", "mimo-v2-omni", [RuntimeError("timeout"), RuntimeError("timeout")])
    qwen = FakeProvider("qwen", "qwen3-vl-plus", [VALID_ANALYSIS | {"meal_name": "chicken rice"}])
    model_calls = InMemoryModelCallRepository()
    router = FoodVisionRouter(
        primary_provider=xiaomi,
        fallback_provider=qwen,
        model_call_repository=model_calls,
    )

    result = router.analyze_food_photo(b"image")

    assert xiaomi.calls == 2
    assert qwen.calls == 1
    assert result["meal_name"] == "chicken rice"
    assert result["model_provider"] == "qwen"
    assert result["model_name"] == "qwen3-vl-plus"
    assert [call.provider for call in model_calls.calls] == ["xiaomi", "xiaomi", "qwen"]
    assert [call.status for call in model_calls.calls] == ["error", "error", "success"]
    assert model_calls.calls[-1].purpose == "fallback"


def test_low_confidence_xiaomi_result_uses_qwen_fallback_and_logs_both() -> None:
    low_confidence = VALID_ANALYSIS | {"confidence": 0.42}
    xiaomi = FakeProvider("xiaomi", "mimo-v2-omni", [low_confidence])
    qwen = FakeProvider("qwen", "qwen3-vl-plus", [VALID_ANALYSIS | {"confidence": 0.81}])
    model_calls = InMemoryModelCallRepository()
    router = FoodVisionRouter(
        primary_provider=xiaomi,
        fallback_provider=qwen,
        model_call_repository=model_calls,
    )

    result = router.analyze_food_photo(b"image")

    assert xiaomi.calls == 1
    assert qwen.calls == 1
    assert result["confidence"] == 0.81
    assert result["model_provider"] == "qwen"
    assert [call.purpose for call in model_calls.calls] == ["food_photo", "fallback"]
