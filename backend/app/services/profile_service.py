from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import date
from decimal import Decimal
from typing import Any


@dataclass
class StoredProfile:
    user_id: str
    height_cm: Decimal | None = None
    current_weight_kg: Decimal | None = None
    age: int | None = None
    sex: str | None = None
    goal_label: str | None = None
    goal_weight_kg: Decimal | None = None
    goal_date: date | None = None
    food_preferences: dict[str, Any] = field(default_factory=dict)
    training_baseline: dict[str, Any] = field(default_factory=dict)
    risk_flags: dict[str, Any] = field(default_factory=dict)


class InMemoryProfileStore:
    def __init__(self) -> None:
        self.profiles_by_user_id: dict[str, StoredProfile] = {}

    def get(self, user_id: str) -> StoredProfile | None:
        return self.profiles_by_user_id.get(user_id)

    def upsert(self, user_id: str, data: dict[str, Any]) -> StoredProfile:
        current = self.get(user_id) or StoredProfile(user_id=user_id)
        merged = asdict(current)
        merged.update({key: value for key, value in data.items() if value is not None})
        profile = StoredProfile(**merged)
        self.profiles_by_user_id[user_id] = profile
        return profile


class ProfileService:
    def __init__(self, store: InMemoryProfileStore | None = None, subscription_service: Any | None = None) -> None:
        self.store = store or InMemoryProfileStore()
        self.subscription_service = subscription_service

    def get_me(self, user: dict) -> dict:
        profile = self.store.get(user["id"])
        subscription = (
            self.subscription_service.get_current(user["id"])
            if self.subscription_service is not None
            else {"plan": "free", "status": "active"}
        )
        return {
            "user": user,
            "profile": self._public_profile(profile),
            "subscription": subscription,
        }

    def save_onboarding(self, user_id: str, data: dict[str, Any]) -> dict:
        profile = self.store.upsert(user_id, data)
        return self._public_profile(profile)

    def patch_profile(self, user_id: str, data: dict[str, Any]) -> dict:
        profile = self.store.upsert(user_id, data)
        return self._public_profile(profile)

    def _public_profile(self, profile: StoredProfile | None) -> dict | None:
        if profile is None:
            return None
        return {
            "height_cm": self._number(profile.height_cm),
            "current_weight_kg": self._number(profile.current_weight_kg),
            "age": profile.age,
            "sex": profile.sex,
            "goal_label": profile.goal_label,
            "goal_weight_kg": self._number(profile.goal_weight_kg),
            "goal_date": profile.goal_date.isoformat() if profile.goal_date else None,
            "food_preferences": profile.food_preferences,
            "training_baseline": profile.training_baseline,
            "risk_flags": profile.risk_flags,
        }

    def _number(self, value: Decimal | None) -> int | float | None:
        if value is None:
            return None
        if value == value.to_integral_value():
            return int(value)
        return float(value)


profile_service = ProfileService()
