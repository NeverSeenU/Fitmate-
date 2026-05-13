from __future__ import annotations

from dataclasses import asdict
import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.db import models
from app.services.profile_service import StoredProfile


class SqlAlchemyProfileRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get(self, user_id: str) -> StoredProfile | None:
        profile = self.session.get(models.UserProfile, uuid.UUID(user_id))
        return self._stored_profile(profile) if profile else None

    def upsert(self, user_id: str, data: dict[str, Any]) -> StoredProfile:
        user_uuid = uuid.UUID(user_id)
        profile = self.session.get(models.UserProfile, user_uuid)
        if profile is None:
            profile = models.UserProfile(
                user_id=user_uuid,
                food_preferences_json={},
                training_baseline_json={},
                risk_flags_json={},
            )
            self.session.add(profile)

        current = asdict(self._stored_profile(profile))
        current.update({key: value for key, value in data.items() if value is not None})
        profile.height_cm = current["height_cm"]
        profile.current_weight_kg = current["current_weight_kg"]
        profile.age = current["age"]
        profile.sex = current["sex"]
        profile.goal_label = current["goal_label"]
        profile.goal_weight_kg = current["goal_weight_kg"]
        profile.goal_date = current["goal_date"]
        profile.food_preferences_json = current["food_preferences"]
        profile.training_baseline_json = current["training_baseline"]
        profile.risk_flags_json = current["risk_flags"]
        self.session.flush()
        return self._stored_profile(profile)

    def _stored_profile(self, profile: models.UserProfile) -> StoredProfile:
        return StoredProfile(
            user_id=str(profile.user_id),
            height_cm=profile.height_cm,
            current_weight_kg=profile.current_weight_kg,
            age=profile.age,
            sex=profile.sex,
            goal_label=profile.goal_label,
            goal_weight_kg=profile.goal_weight_kg,
            goal_date=profile.goal_date,
            food_preferences=profile.food_preferences_json or {},
            training_baseline=profile.training_baseline_json or {},
            risk_flags=profile.risk_flags_json or {},
        )
