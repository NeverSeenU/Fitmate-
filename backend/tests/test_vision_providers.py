import json
import os

import pytest

from app.ai.providers.qwen import QwenVisionProvider
from app.ai.providers.xiaomi import XiaomiVisionProvider


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
    "fat_loss_advice": "Go lighter next meal.",
    "supportive_reply": "Log the range and keep going.",
    "safety_flags": [],
}


class FakeTransport:
    def __init__(self, response_payload: dict | None = None, status: int = 200) -> None:
        self.response_payload = response_payload or chat_response(VALID_ANALYSIS)
        self.status = status
        self.requests: list[dict] = []

    def post_json(
        self,
        url: str,
        headers: dict[str, str],
        payload: dict,
        timeout_seconds: float,
    ) -> dict:
        self.requests.append(
            {
                "url": url,
                "headers": headers,
                "payload": payload,
                "timeout_seconds": timeout_seconds,
            }
        )
        if self.status >= 400:
            raise RuntimeError(f"provider_http_{self.status}")
        return self.response_payload


def test_xiaomi_provider_sends_openai_compatible_multimodal_request(monkeypatch) -> None:
    monkeypatch.setenv("XIAOMI_API_KEY", "xiaomi-key")
    monkeypatch.setenv("XIAOMI_BASE_URL", "https://mimo.example/v1")
    monkeypatch.setenv("XIAOMI_MODEL_NAME", "mimo-v2-omni-test")
    transport = FakeTransport()
    provider = XiaomiVisionProvider(transport=transport)

    result = provider.analyze_food_photo(b"fake-image", user_note="less rice")

    request = transport.requests[0]
    assert result["meal_name"] == "bibimbap"
    assert request["url"] == "https://mimo.example/v1/chat/completions"
    assert request["headers"]["Authorization"] == "Bearer xiaomi-key"
    assert request["payload"]["model"] == "mimo-v2-omni-test"
    assert request["payload"]["response_format"] == {"type": "json_object"}
    assert request["payload"]["messages"][0]["role"] == "system"
    user_content = request["payload"]["messages"][1]["content"]
    assert user_content[0]["type"] == "text"
    assert "less rice" in user_content[0]["text"]
    assert user_content[1]["type"] == "image_url"
    assert user_content[1]["image_url"]["url"].startswith("data:image/jpeg;base64,")


def test_xiaomi_provider_sends_openai_compatible_file_extraction_request(monkeypatch) -> None:
    monkeypatch.setenv("XIAOMI_API_KEY", "xiaomi-key")
    monkeypatch.setenv("XIAOMI_BASE_URL", "https://mimo.example/v1")
    transport = FakeTransport(response_payload=chat_response({
        "document_type": "body_report",
        "confidence": 0.84,
        "insights": [{"label": "weight_kg", "value": "70 kg", "source": "ai", "source_text": "weight 70 kg", "confidence": 0.84}],
        "recommendations": ["Sync weight after user confirmation."],
    }))
    provider = XiaomiVisionProvider(transport=transport)

    result = provider.analyze_file_text("body-report.txt", "weight 70 kg", "text/plain", user_prompt="What changed?")

    request = transport.requests[0]
    assert result["document_type"] == "body_report"
    assert request["url"] == "https://mimo.example/v1/chat/completions"
    assert request["payload"]["response_format"] == {"type": "json_object"}
    assert request["payload"]["messages"][0]["role"] == "system"
    assert request["payload"]["messages"][1]["role"] == "user"
    assert "document_type, confidence, insights, recommendations" in request["payload"]["messages"][1]["content"]
    assert "source_text" in request["payload"]["messages"][1]["content"]
    assert "Do not return only document_type" in request["payload"]["messages"][1]["content"]
    assert "weight_kg='70 kg'" in request["payload"]["messages"][1]["content"]
    assert "Filename: body-report.txt" in request["payload"]["messages"][1]["content"]
    assert "User question: What changed?" in request["payload"]["messages"][1]["content"]


def test_xiaomi_provider_sends_openai_compatible_text_food_request(monkeypatch) -> None:
    monkeypatch.setenv("XIAOMI_API_KEY", "xiaomi-key")
    monkeypatch.setenv("XIAOMI_BASE_URL", "https://mimo.example/v1")
    transport = FakeTransport()
    provider = XiaomiVisionProvider(transport=transport)

    result = provider.analyze_food_text("ate chicken rice")

    request = transport.requests[0]
    assert result["meal_name"] == "bibimbap"
    assert request["url"] == "https://mimo.example/v1/chat/completions"
    assert request["payload"]["response_format"] == {"type": "json_object"}
    assert request["payload"]["messages"][0]["role"] == "system"
    assert "Food text:" in request["payload"]["messages"][1]["content"]


def test_xiaomi_provider_sends_openai_compatible_workout_analysis_request(monkeypatch) -> None:
    monkeypatch.setenv("XIAOMI_API_KEY", "xiaomi-key")
    monkeypatch.setenv("XIAOMI_BASE_URL", "https://mimo.example/v1")
    transport = FakeTransport(response_payload=chat_response({
        "workout_type": "strength",
        "duration_minutes": 45,
        "intensity": "medium",
        "calories_burned_range_kcal": [180, 270],
        "confidence": 0.8,
        "summary": "Strength training.",
    }))
    provider = XiaomiVisionProvider(transport=transport)

    result = provider.analyze_workout_text("strength training 45 minutes")

    request = transport.requests[0]
    assert result["workout_type"] == "strength"
    assert request["url"] == "https://mimo.example/v1/chat/completions"
    assert request["payload"]["response_format"] == {"type": "json_object"}
    assert request["payload"]["messages"][0]["role"] == "system"
    assert "Workout note:" in request["payload"]["messages"][1]["content"]


def test_qwen_provider_reads_dashscope_env_and_parses_json_content(monkeypatch) -> None:
    monkeypatch.setenv("DASHSCOPE_API_KEY", "qwen-key")
    monkeypatch.setenv("DASHSCOPE_BASE_URL", "https://dashscope.example/compatible-mode/v1")
    monkeypatch.setenv("QWEN_MODEL_NAME", "qwen3-vl-plus-test")
    transport = FakeTransport()
    provider = QwenVisionProvider(transport=transport)

    result = provider.analyze_food_photo(b"fake-image")

    request = transport.requests[0]
    assert result["calories_range_kcal"] == [600, 900]
    assert request["url"] == "https://dashscope.example/compatible-mode/v1/chat/completions"
    assert request["headers"]["Authorization"] == "Bearer qwen-key"
    assert request["payload"]["model"] == "qwen3-vl-plus-test"


def test_provider_requires_api_key(monkeypatch) -> None:
    clear_env(monkeypatch, "XIAOMI_API_KEY")
    provider = XiaomiVisionProvider(transport=FakeTransport())

    with pytest.raises(RuntimeError, match="xiaomi_provider_not_configured"):
        provider.analyze_food_photo(b"fake-image")


def test_provider_rejects_invalid_json_response(monkeypatch) -> None:
    monkeypatch.setenv("DASHSCOPE_API_KEY", "qwen-key")
    transport = FakeTransport(response_payload=chat_response("not-json"))
    provider = QwenVisionProvider(transport=transport)

    with pytest.raises(ValueError, match="provider_returned_invalid_json"):
        provider.analyze_food_photo(b"fake-image")


def chat_response(content: dict | str) -> dict:
    return {
        "choices": [
            {
                "message": {
                    "content": content if isinstance(content, str) else json.dumps(content),
                }
            }
        ]
    }


def clear_env(monkeypatch, key: str) -> None:
    if key in os.environ:
        monkeypatch.delenv(key)
