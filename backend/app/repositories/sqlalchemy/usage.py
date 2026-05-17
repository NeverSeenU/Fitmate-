from __future__ import annotations

from datetime import date, timezone
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import models
from app.services.usage_service import StoredUsageCounter, field_for_purpose


class SqlAlchemyUsageCounterRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get_or_create(self, user_id: str, target_date: date) -> StoredUsageCounter:
        counter = self._get(user_id, target_date)
        if counter is None:
            counter = models.UsageCounter(user_id=uuid.UUID(user_id), date=target_date)
            self.session.add(counter)
            self.session.flush()
        return self._stored(counter)

    def increment(self, user_id: str, target_date: date, purpose: str, amount: int = 1) -> StoredUsageCounter:
        counter = self._get(user_id, target_date)
        if counter is None:
            counter = models.UsageCounter(user_id=uuid.UUID(user_id), date=target_date)
            self.session.add(counter)
            self.session.flush()
        field = field_for_purpose(purpose)
        setattr(counter, field, getattr(counter, field) + amount)
        self.session.flush()
        return self._stored(counter)

    def _get(self, user_id: str, target_date: date) -> models.UsageCounter | None:
        return self.session.scalar(
            select(models.UsageCounter).where(
                models.UsageCounter.user_id == uuid.UUID(user_id),
                models.UsageCounter.date == target_date,
            )
        )

    def _stored(self, counter: models.UsageCounter) -> StoredUsageCounter:
        created = counter.created_at
        updated = counter.updated_at
        if created is not None and created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        if updated is not None and updated.tzinfo is None:
            updated = updated.replace(tzinfo=timezone.utc)
        return StoredUsageCounter(
            id=str(counter.id),
            user_id=str(counter.user_id),
            date=counter.date,
            ai_text_count=counter.ai_text_count,
            food_photo_count=counter.food_photo_count,
            workout_analysis_count=counter.workout_analysis_count,
            fallback_model_count=counter.fallback_model_count,
            deep_review_count=counter.deep_review_count,
            estimated_cost_cents=counter.estimated_cost_cents,
            created_at=created,
            updated_at=updated,
        )
