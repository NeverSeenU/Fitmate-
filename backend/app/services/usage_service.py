from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timezone
import uuid


PURPOSE_TO_FIELD = {
    "chat": "ai_text_count",
    "food_photo": "food_photo_count",
    "workout": "workout_analysis_count",
}


@dataclass
class StoredUsageCounter:
    id: str
    user_id: str
    date: date
    ai_text_count: int = 0
    food_photo_count: int = 0
    workout_analysis_count: int = 0
    fallback_model_count: int = 0
    deep_review_count: int = 0
    estimated_cost_cents: int = 0
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


class UsageLimitExceededError(RuntimeError):
    def __init__(self, purpose: str, reason: str) -> None:
        super().__init__(reason)
        self.purpose = purpose
        self.reason = reason


class InMemoryUsageCounterStore:
    def __init__(self) -> None:
        self.counters_by_user_date: dict[tuple[str, date], StoredUsageCounter] = {}

    def get_or_create(self, user_id: str, target_date: date) -> StoredUsageCounter:
        key = (user_id, target_date)
        if key not in self.counters_by_user_date:
            self.counters_by_user_date[key] = StoredUsageCounter(
                id=str(uuid.uuid4()),
                user_id=user_id,
                date=target_date,
            )
        return self.counters_by_user_date[key]

    def increment(self, user_id: str, target_date: date, purpose: str, amount: int = 1) -> StoredUsageCounter:
        counter = self.get_or_create(user_id, target_date)
        field = field_for_purpose(purpose)
        setattr(counter, field, getattr(counter, field) + amount)
        counter.updated_at = datetime.now(timezone.utc)
        return counter


class UsageService:
    def __init__(self, store: InMemoryUsageCounterStore | None = None, subscription_service_dependency=None) -> None:
        from app.services.subscription_service import subscription_service

        self.store = store or InMemoryUsageCounterStore()
        self.subscription_service = subscription_service_dependency or subscription_service

    def ensure_allowed(self, user_id: str, purpose: str, target_date: date | None = None) -> None:
        usage_date = target_date or date.today()
        counter = self.store.get_or_create(user_id, usage_date)
        plan = self.subscription_service.get_current(user_id)["plan"]
        decision = self.subscription_service.decide_fair_use(
            plan=plan,
            purpose=purpose,
            daily_usage_count=getattr(counter, field_for_purpose(purpose)),
        )
        if not decision["allowed"]:
            raise UsageLimitExceededError(purpose=purpose, reason=decision["reason"])

    def increment(self, user_id: str, purpose: str, target_date: date | None = None) -> StoredUsageCounter:
        return self.store.increment(user_id, target_date or date.today(), purpose)

    def current(self, user_id: str, target_date: date | None = None) -> StoredUsageCounter:
        return self.store.get_or_create(user_id, target_date or date.today())


def field_for_purpose(purpose: str) -> str:
    try:
        return PURPOSE_TO_FIELD[purpose]
    except KeyError as exc:
        raise ValueError(f"unknown_usage_purpose:{purpose}") from exc


usage_service = UsageService()
