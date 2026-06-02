import os

from app.ai.providers.openai_compatible import JsonTransport, OpenAICompatibleVisionProvider
from app.config import get_settings


class QwenVisionProvider(OpenAICompatibleVisionProvider):
    provider_name = "qwen"

    def __init__(self, transport: JsonTransport | None = None) -> None:
        settings = get_settings()
        super().__init__(
            provider_name=self.provider_name,
            model_name=settings.qwen_model_name,
            api_key=os.getenv("DASHSCOPE_API_KEY") or os.getenv("QWEN_API_KEY"),
            base_url=os.getenv(
                "DASHSCOPE_BASE_URL",
                os.getenv("QWEN_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1"),
            ),
            not_configured_error="qwen_provider_not_configured",
            transport=transport,
            timeout_seconds=settings.ai_provider_timeout_seconds,
        )
