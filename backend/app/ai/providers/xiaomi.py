import os

from app.ai.providers.openai_compatible import JsonTransport, OpenAICompatibleVisionProvider
from app.config import get_settings


class XiaomiVisionProvider(OpenAICompatibleVisionProvider):
    provider_name = "xiaomi"

    def __init__(self, transport: JsonTransport | None = None) -> None:
        settings = get_settings()
        super().__init__(
            provider_name=self.provider_name,
            model_name=settings.xiaomi_model_name,
            api_key=os.getenv("XIAOMI_API_KEY"),
            base_url=os.getenv("XIAOMI_BASE_URL", "https://api.xiaomimimo.com/v1"),
            not_configured_error="xiaomi_provider_not_configured",
            transport=transport,
            timeout_seconds=settings.ai_provider_timeout_seconds,
        )
