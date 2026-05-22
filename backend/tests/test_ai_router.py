from app.ai.router import FileInsightRouter, FoodVisionRouter, TextFoodAnalysisRouter, WorkoutAnalysisRouter
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

    def analyze_food_text(self, text: str) -> object:
        self.calls += 1
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response

    def analyze_file_text(self, filename: str, content_text: str, content_type: str, user_prompt: str | None = None) -> object:
        self.calls += 1
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response

    def analyze_workout_text(self, text: str) -> object:
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


def test_xiaomi_string_ranges_are_normalized_for_food_analysis() -> None:
    xiaomi = FakeProvider(
        "xiaomi",
        "mimo-v2-omni",
        [
            VALID_ANALYSIS | {
                "calories_range_kcal": "600-900",
                "protein_g_range": "25-40",
                "carbs_g_range": "70-100",
                "fat_g_range": "18-35",
            }
        ],
    )
    qwen = FakeProvider("qwen", "qwen3-vl-plus", [])
    router = FoodVisionRouter(primary_provider=xiaomi, fallback_provider=qwen)

    result = router.analyze_food_photo(b"image")

    assert result["model_provider"] == "xiaomi"
    assert result["calories_range_kcal"] == [600.0, 900.0]
    assert result["protein_g_range"] == [25.0, 40.0]


def test_xiaomi_string_items_and_boolean_are_normalized_for_food_analysis() -> None:
    xiaomi = FakeProvider(
        "xiaomi",
        "mimo-v2-omni",
        [
            VALID_ANALYSIS | {
                "detected_items": "rice, egg, sauce",
                "needs_follow_up": "true",
                "follow_up_question": "",
                "safety_flags": "no_food_detected",
            }
        ],
    )
    qwen = FakeProvider("qwen", "qwen3-vl-plus", [])
    router = FoodVisionRouter(primary_provider=xiaomi, fallback_provider=qwen)

    result = router.analyze_food_photo(b"image")

    assert result["detected_items"] == ["rice", "egg", "sauce"]
    assert result["needs_follow_up"] is True
    assert result["follow_up_question"] is None
    assert result["safety_flags"] == ["no_food_detected"]


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


def test_food_vision_router_can_force_xiaomi_provider(monkeypatch) -> None:
    monkeypatch.setenv("FOOD_VISION_PROVIDER", "xiaomi")
    monkeypatch.setenv("XIAOMI_API_KEY", "xiaomi-key")
    router = FoodVisionRouter(model_call_repository=InMemoryModelCallRepository())

    assert router.primary_provider.provider_name == "xiaomi"
    assert router.fallback_provider.provider_name == "xiaomi"
    assert router.low_confidence_threshold == 0.0


def test_file_insight_router_uses_ai_structured_output_and_logs_usage() -> None:
    xiaomi = FakeProvider("xiaomi", "mimo-v2-omni", [
        {
            "document_type": "menu",
            "confidence": 0.83,
            "insights": [
                {"label": "calories_kcal", "value": "550 kcal", "source": "ai", "source_text": "calories 550", "confidence": 0.86},
                {"label": "protein_g", "value": "35g", "source": "ai", "source_text": "protein 35g", "confidence": 0.8},
            ],
            "recommendations": ["Use this meal as a moderate lunch."],
        }
    ])
    qwen = FakeProvider("qwen", "qwen3-vl-plus", [RuntimeError("not_configured")])
    model_calls = InMemoryModelCallRepository()
    router = FileInsightRouter(
        primary_provider=xiaomi,
        fallback_provider=qwen,
        model_call_repository=model_calls,
    )

    result = router.analyze_file_text("menu.txt", "lunch calories 550 protein 35g", "text/plain")

    assert result is not None
    assert result["document_type"] == "menu"
    assert result["confidence"] == 0.83
    assert result["model_provider"] == "xiaomi"
    assert {item["label"] for item in result["insights"]}.issuperset({"document_type", "calories_kcal", "protein_g"})
    protein = next(item for item in result["insights"] if item["label"] == "protein_g")
    assert protein["source_text"] == "protein 35g"
    assert protein["confidence"] == 0.8
    assert qwen.calls == 0
    assert model_calls.calls[0].purpose == "file_insight"
    assert model_calls.calls[0].status == "success"


def test_file_insight_router_falls_back_when_primary_schema_is_invalid() -> None:
    xiaomi = FakeProvider("xiaomi", "mimo-v2-omni", [{"document_type": "unknown", "confidence": 0.8, "insights": [], "recommendations": []}])
    qwen = FakeProvider("qwen", "qwen3-vl-plus", [
        {
            "document_type": "workout_plan",
            "confidence": 0.75,
            "insights": [{"label": "training_frequency", "value": "4 days/week", "source": "ai", "source_text": "4 days/week", "confidence": 0.75}],
            "recommendations": ["Keep recovery days visible."],
        }
    ])
    model_calls = InMemoryModelCallRepository()
    router = FileInsightRouter(
        primary_provider=xiaomi,
        fallback_provider=qwen,
        model_call_repository=model_calls,
    )

    result = router.analyze_file_text("workout.txt", "strength 4 days/week", "text/plain")

    assert result is not None
    assert result["document_type"] == "workout_plan"
    assert result["model_provider"] == "qwen"
    assert [call.status for call in model_calls.calls] == ["error", "success"]


def test_file_insight_router_rejects_invalid_confidence() -> None:
    xiaomi = FakeProvider("xiaomi", "mimo-v2-omni", [
        {
            "document_type": "menu",
            "confidence": 1.4,
            "insights": [{"label": "protein_g", "value": "35g", "source": "ai"}],
            "recommendations": [],
        }
    ])
    qwen = FakeProvider("qwen", "qwen3-vl-plus", [RuntimeError("not_configured")])
    model_calls = InMemoryModelCallRepository()
    router = FileInsightRouter(primary_provider=xiaomi, fallback_provider=qwen, model_call_repository=model_calls)

    result = router.analyze_file_text("menu.txt", "protein 35g", "text/plain")

    assert result is None
    assert [call.status for call in model_calls.calls] == ["error", "error"]
    assert model_calls.calls[0].error_code == "schema_error"


def test_workout_analysis_router_uses_ai_structured_output_and_logs_usage() -> None:
    xiaomi = FakeProvider("xiaomi", "mimo-v2-omni", [
        {
            "workout_type": "cardio_plus_strength",
            "duration_minutes": 80,
            "intensity": "high",
            "calories_burned_range_kcal": [360, 560],
            "confidence": 0.82,
            "summary": "Elliptical plus leg training.",
        }
    ])
    qwen = FakeProvider("qwen", "qwen3-vl-plus", [])
    model_calls = InMemoryModelCallRepository()
    router = WorkoutAnalysisRouter(
        primary_provider=xiaomi,
        fallback_provider=qwen,
        model_call_repository=model_calls,
    )

    result = router.analyze_workout_text("elliptical 45 min leg training 35 min")

    assert result is not None
    assert result["workout_type"] == "cardio_plus_strength"
    assert result["duration_minutes"] == 80
    assert result["model_provider"] == "xiaomi"
    assert qwen.calls == 0
    assert model_calls.calls[0].purpose == "workout_analysis"
    assert model_calls.calls[0].status == "success"


def test_workout_analysis_router_falls_back_when_primary_schema_is_invalid() -> None:
    xiaomi = FakeProvider("xiaomi", "mimo-v2-omni", [{"workout_type": "unknown"}])
    qwen = FakeProvider("qwen", "qwen3-vl-plus", [
        {
            "workout_type": "running",
            "duration_minutes": 30,
            "intensity": "low",
            "calories_burned_range_kcal": [90, 150],
            "confidence": 0.74,
            "summary": "Easy run.",
        }
    ])
    model_calls = InMemoryModelCallRepository()
    router = WorkoutAnalysisRouter(
        primary_provider=xiaomi,
        fallback_provider=qwen,
        model_call_repository=model_calls,
    )

    result = router.analyze_workout_text("easy run 30 min")

    assert result is not None
    assert result["workout_type"] == "running"
    assert result["model_provider"] == "qwen"
    assert [call.status for call in model_calls.calls] == ["error", "success"]


def test_text_food_analysis_router_uses_ai_structured_output_and_logs_usage() -> None:
    xiaomi = FakeProvider("xiaomi", "mimo-v2-omni", [VALID_ANALYSIS | {"meal_name": "chicken rice"}])
    qwen = FakeProvider("qwen", "qwen3-vl-plus", [])
    model_calls = InMemoryModelCallRepository()
    router = TextFoodAnalysisRouter(
        primary_provider=xiaomi,
        fallback_provider=qwen,
        model_call_repository=model_calls,
    )

    result = router.analyze_food_text("ate chicken rice")

    assert result is not None
    assert result["meal_name"] == "chicken rice"
    assert result["model_provider"] == "xiaomi"
    assert qwen.calls == 0
    assert model_calls.calls[0].purpose == "food_text"
    assert model_calls.calls[0].status == "success"


def test_text_food_analysis_router_falls_back_when_primary_schema_is_invalid() -> None:
    xiaomi = FakeProvider("xiaomi", "mimo-v2-omni", [{"meal_name": "bad"}])
    qwen = FakeProvider("qwen", "qwen3-vl-plus", [VALID_ANALYSIS | {"meal_name": "latte"}])
    model_calls = InMemoryModelCallRepository()
    router = TextFoodAnalysisRouter(
        primary_provider=xiaomi,
        fallback_provider=qwen,
        model_call_repository=model_calls,
    )

    result = router.analyze_food_text("latte")

    assert result is not None
    assert result["meal_name"] == "latte"
    assert result["model_provider"] == "qwen"
    assert [call.status for call in model_calls.calls] == ["error", "success"]
