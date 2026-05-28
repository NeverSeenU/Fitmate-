from __future__ import annotations

import base64
import json
import urllib.error
import urllib.request
from typing import Protocol


SYSTEM_PROMPT = (
    "You are FitMate AI's food-photo nutrition analyst. Return valid JSON only. "
    "Use calorie and macro ranges, never fake exact precision. Ask one concise "
    "follow-up question when portion size, oil, sauce, or shared servings are unclear. "
    "For all user-facing fields, including meal_name, detected_items, follow_up_question, "
    "fat_loss_advice, and supportive_reply, reply in Simplified Chinese by default."
)


USER_PROMPT = (
    "Analyze this food photo for a fat-loss coaching app. Required JSON fields: "
    "meal_name, detected_items, calories_range_kcal, protein_g_range, carbs_g_range, "
    "fat_g_range, confidence, needs_follow_up, follow_up_question, fat_loss_advice, "
    "supportive_reply, safety_flags. detected_items must describe only visible food items "
    "and observable portion clues, not questions. If portion size, oil, sauce, or shared "
    "servings are unclear, set needs_follow_up=true and put exactly one concise question "
    "in follow_up_question. Do not put follow-up questions into detected_items or "
    "fat_loss_advice. fat_loss_advice should be coaching guidance only after the visible "
    "food estimate; if the estimate is too uncertain, say that user input is needed first."
)
TEXT_FOOD_SYSTEM_PROMPT = (
    "You are FitMate AI's text food-log nutrition analyst. Return valid JSON only. "
    "Use ranges and uncertainty. Do not invent exact portion sizes. Reply in Simplified Chinese by default."
)
TEXT_FOOD_USER_PROMPT = (
    "Analyze this user's food text for a fat-loss coaching app. Required JSON fields: "
    "meal_name, detected_items, calories_range_kcal, protein_g_range, carbs_g_range, "
    "fat_g_range, confidence, needs_follow_up, follow_up_question, fat_loss_advice, "
    "supportive_reply, safety_flags."
)
FILE_SYSTEM_PROMPT = (
    "You are FitMate AI's structured health document extractor. Return valid JSON only. "
    "Extract only values supported by the uploaded content. Do not invent numbers. Reply in Simplified Chinese by default."
)
FILE_USER_PROMPT = (
    "Classify the uploaded content as one of: body_report, menu, workout_plan, general. "
    "Return JSON fields: document_type, confidence, insights, recommendations. insights must be a list "
    "of objects with label, value, source, source_text, confidence. source_text must be a short exact "
    "excerpt from the uploaded content that supports the value, or empty when unavailable. "
    "confidence must be 0 to 1. Supported labels: document_type, weight_kg, bmi, "
    "body_fat_percent, protein_g, calories_kcal, training_frequency. "
    "Do not return only document_type when the text contains supported values. "
    "Extract every supported value that is explicitly present in the text. "
    "Examples: text 'weight 70kg body fat 21% protein 120g' must include "
    "weight_kg='70 kg', body_fat_percent='21%', protein_g='120g'. "
    "Text 'protein 35g calories 550 kcal' must include protein_g='35g' and calories_kcal='550 kcal'. "
    "Text '4 days/week' must include training_frequency='4 days/week'."
)
WORKOUT_SYSTEM_PROMPT = (
    "You are FitMate AI's workout log analyst. Return valid JSON only. "
    "Extract the user's actual training details without inventing exercises or precision. Reply in Simplified Chinese by default."
)
WORKOUT_USER_PROMPT = (
    "Analyze this workout note for a fitness tracking app. Required JSON fields: "
    "workout_type, duration_minutes, intensity, calories_burned_range_kcal, confidence, summary. "
    "workout_type must be one of running, strength, cardio_plus_strength, mixed, mobility, sports. "
    "intensity must be low, medium, or high."
)
CHAT_RECOVERY_SOUL_PROMPT = (
    "You are FitMate AI, a non-shaming fat-loss recovery companion. "
    "Reply in Simplified Chinese by default. Sound like a calm, perceptive human companion, not a generic wellness article or checklist bot. "
    "Use warm, plain speech with a little personality, but do not overuse emojis, headings, bold markdown, blue diamonds, or green checkmark lists. "
    "Your job is not to shame, punish, or optimize the user into extremes. "
    "Context honesty is mandatory: only cite known facts from the provided conversation or structured context. "
    "Do not infer or invent missing context. If there is no workout record, do not say the user trained today or burned a lot. "
    "If there is no food record, do not say 'based on today's records'. If there is no weight trend, do not judge a trend. "
    "When context is missing, say so briefly and ask exactly one small question. "
    "First answer the user's actual question directly, then steady the emotion, then give one small next step. "
    "Never recommend skipping meals, purging, laxatives, extreme fasting, or compensatory overtraining. "
    "For overeating panic, treat it as one meal, not a failed week. For scale anxiety, explain water, salt, carbs, sleep, training inflammation, and 3-7 day trends. "
    "For missed records, restart from the next meal without requiring perfect backfill. Keep responses concise and mobile-friendly: usually 2 short paragraphs plus one small question."
)


class JsonTransport(Protocol):
    def post_json(
        self,
        url: str,
        headers: dict[str, str],
        payload: dict,
        timeout_seconds: float,
    ) -> dict:
        ...


class UrllibJsonTransport:
    def post_json(
        self,
        url: str,
        headers: dict[str, str],
        payload: dict,
        timeout_seconds: float,
    ) -> dict:
        data = json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(
            url=url,
            data=data,
            headers=headers | {"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:500]
            raise RuntimeError(f"provider_http_{exc.code}:{detail}") from exc
        except urllib.error.URLError as exc:
            raise RuntimeError("provider_network_error") from exc
        except TimeoutError as exc:
            raise TimeoutError("provider_timeout") from exc


class OpenAICompatibleVisionProvider:
    provider_name: str

    def __init__(
        self,
        *,
        provider_name: str,
        model_name: str,
        api_key: str | None,
        base_url: str,
        not_configured_error: str,
        transport: JsonTransport | None = None,
        timeout_seconds: float = 30,
    ) -> None:
        self.provider_name = provider_name
        self.model_name = model_name
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.not_configured_error = not_configured_error
        self.transport = transport or UrllibJsonTransport()
        self.timeout_seconds = timeout_seconds

    def analyze_food_photo(self, image_bytes: bytes, user_note: str | None = None) -> object:
        if not self.api_key:
            raise RuntimeError(self.not_configured_error)

        payload = {
            "model": self.model_name,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": self._user_text(user_note)},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{base64.b64encode(image_bytes).decode('ascii')}",
                            },
                        },
                    ],
                },
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.2,
        }
        response = self.transport.post_json(
            url=f"{self.base_url}/chat/completions",
            headers={"Authorization": f"Bearer {self.api_key}"},
            payload=payload,
            timeout_seconds=self.timeout_seconds,
        )
        return self._extract_json_content(response)

    def analyze_food_text(self, text: str) -> object:
        if not self.api_key:
            raise RuntimeError(self.not_configured_error)

        payload = {
            "model": self.model_name,
            "messages": [
                {"role": "system", "content": TEXT_FOOD_SYSTEM_PROMPT},
                {"role": "user", "content": f"{TEXT_FOOD_USER_PROMPT}\n\nFood text:\n{text[:4000]}"},
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.1,
        }
        response = self.transport.post_json(
            url=f"{self.base_url}/chat/completions",
            headers={"Authorization": f"Bearer {self.api_key}"},
            payload=payload,
            timeout_seconds=self.timeout_seconds,
        )
        return self._extract_json_content(response)

    def analyze_file_text(self, filename: str, content_text: str, content_type: str, user_prompt: str | None = None) -> object:
        if not self.api_key:
            raise RuntimeError(self.not_configured_error)

        payload = {
            "model": self.model_name,
            "messages": [
                {"role": "system", "content": FILE_SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": (
                        f"{FILE_USER_PROMPT}\n\n"
                        f"Filename: {filename}\n"
                        f"Content type: {content_type}\n"
                        f"User question: {(user_prompt or '').strip() or 'None'}\n"
                        f"Extracted text:\n{content_text[:12000]}"
                    ),
                },
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.1,
        }
        response = self.transport.post_json(
            url=f"{self.base_url}/chat/completions",
            headers={"Authorization": f"Bearer {self.api_key}"},
            payload=payload,
            timeout_seconds=self.timeout_seconds,
        )
        return self._extract_json_content(response)

    def analyze_workout_text(self, text: str) -> object:
        if not self.api_key:
            raise RuntimeError(self.not_configured_error)

        payload = {
            "model": self.model_name,
            "messages": [
                {"role": "system", "content": WORKOUT_SYSTEM_PROMPT},
                {"role": "user", "content": f"{WORKOUT_USER_PROMPT}\n\nWorkout note:\n{text[:4000]}"},
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.1,
        }
        response = self.transport.post_json(
            url=f"{self.base_url}/chat/completions",
            headers={"Authorization": f"Bearer {self.api_key}"},
            payload=payload,
            timeout_seconds=self.timeout_seconds,
        )
        return self._extract_json_content(response)

    def generate_chat_reply(self, text: str, conversation_context: list[dict] | None = None) -> str:
        if not self.api_key:
            raise RuntimeError(self.not_configured_error)

        messages = [{"role": "system", "content": CHAT_RECOVERY_SOUL_PROMPT}]
        for message in (conversation_context or [])[-8:]:
            role = message.get("role")
            content = message.get("content")
            if role in {"user", "assistant"} and isinstance(content, str) and content.strip():
                messages.append({"role": role, "content": content[:2000]})
        messages.append({"role": "user", "content": text[:4000]})
        payload = {
            "model": self.model_name,
            "messages": messages,
            "temperature": 0.35,
        }
        response = self.transport.post_json(
            url=f"{self.base_url}/chat/completions",
            headers={"Authorization": f"Bearer {self.api_key}"},
            payload=payload,
            timeout_seconds=self.timeout_seconds,
        )
        return self._extract_text_content(response)

    def _user_text(self, user_note: str | None) -> str:
        if not user_note:
            return USER_PROMPT
        return f"{USER_PROMPT}\n\nUser note: {user_note}"

    def _extract_json_content(self, response: dict) -> object:
        try:
            content = response["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise ValueError("provider_response_missing_content") from exc
        if isinstance(content, dict):
            return content
        if not isinstance(content, str):
            raise ValueError("provider_response_content_invalid")
        try:
            return json.loads(content)
        except json.JSONDecodeError as exc:
            raise ValueError("provider_returned_invalid_json") from exc

    def _extract_text_content(self, response: dict) -> str:
        try:
            content = response["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise ValueError("provider_response_missing_content") from exc
        if not isinstance(content, str) or not content.strip():
            raise ValueError("provider_response_content_invalid")
        return content.strip()
