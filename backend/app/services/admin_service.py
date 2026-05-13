from __future__ import annotations

from app.services.safety_service import safety_service


class AdminService:
    def __init__(self, safety_service_dependency=None, model_call_repository=None) -> None:
        self.safety_service = safety_service_dependency or safety_service
        self.model_call_repository = model_call_repository

    def metrics(self) -> dict:
        model_usage = (
            self.model_call_repository.metrics()
            if self.model_call_repository is not None
            else {
                "total_calls": 0,
                "fallback_rate": 0,
                "estimated_cost_cents": 0,
                "by_provider": {},
            }
        )
        return {
            "safety_events": self.safety_service.metrics(),
            "model_usage": model_usage,
        }


admin_service = AdminService()
