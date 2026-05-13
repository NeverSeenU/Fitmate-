from __future__ import annotations

from datetime import datetime, timezone
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import models
from app.services.subscription_service import StoredSubscription


class SqlAlchemySubscriptionRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get(self, user_id: str) -> StoredSubscription:
        subscription = self._latest_subscription(user_id)
        if subscription is None:
            stored = StoredSubscription(user_id=user_id)
            return self.save(stored)
        return self._stored_subscription(subscription)

    def save(self, subscription: StoredSubscription) -> StoredSubscription:
        current = self._latest_subscription(subscription.user_id)
        if current is None:
            current = models.Subscription(
                user_id=uuid.UUID(subscription.user_id),
                plan=subscription.plan,
                status=subscription.status,
                provider=subscription.provider,
            )
            self.session.add(current)

        current.plan = subscription.plan
        current.status = subscription.status
        current.provider = subscription.provider
        current.provider_subscription_id = subscription.provider_subscription_id
        current.current_period_end = subscription.renews_at
        self.session.flush()
        return self._stored_subscription(current)

    def _latest_subscription(self, user_id: str) -> models.Subscription | None:
        return self.session.scalar(
            select(models.Subscription)
            .where(models.Subscription.user_id == uuid.UUID(user_id))
            .order_by(models.Subscription.created_at.desc())
            .limit(1)
        )

    def _stored_subscription(self, subscription: models.Subscription) -> StoredSubscription:
        renews_at = subscription.current_period_end
        if renews_at is not None and renews_at.tzinfo is None:
            renews_at = renews_at.replace(tzinfo=timezone.utc)
        return StoredSubscription(
            user_id=str(subscription.user_id),
            plan=subscription.plan,
            status=subscription.status,
            provider=subscription.provider,
            provider_subscription_id=subscription.provider_subscription_id,
            renews_at=renews_at,
        )
