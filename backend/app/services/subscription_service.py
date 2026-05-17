from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone


PRODUCT_TO_PLAN = {
    "fitmate.pro.monthly": "pro",
    "fitmate.pro.yearly": "pro",
    "fitmate.elite.monthly": "elite",
    "fitmate.elite.yearly": "elite",
}

STOREKIT_PRODUCT_IDS = {
    "pro_monthly": "fitmate.pro.monthly",
    "pro_yearly": "fitmate.pro.yearly",
    "elite_monthly": "fitmate.elite.monthly",
    "elite_yearly": "fitmate.elite.yearly",
}


@dataclass
class StoredSubscription:
    user_id: str
    plan: str = "free"
    status: str = "active"
    provider: str = "manual"
    provider_subscription_id: str | None = None
    renews_at: datetime | None = None


class InMemorySubscriptionStore:
    def __init__(self) -> None:
        self.subscriptions_by_user_id: dict[str, StoredSubscription] = {}

    def get(self, user_id: str) -> StoredSubscription:
        if user_id not in self.subscriptions_by_user_id:
            self.subscriptions_by_user_id[user_id] = StoredSubscription(user_id=user_id)
        return self.subscriptions_by_user_id[user_id]

    def save(self, subscription: StoredSubscription) -> StoredSubscription:
        self.subscriptions_by_user_id[subscription.user_id] = subscription
        return subscription


class SubscriptionService:
    # Backend-only thresholds. Never return these values to the mobile app.
    _fair_use_thresholds = {
        "free": {"food_photo": 10, "chat": 80, "workout": 20},
        "pro": {"food_photo": 120, "chat": 800, "workout": 160},
        "elite": {"food_photo": 360, "chat": 1800, "workout": 360},
    }

    def __init__(self, store: InMemorySubscriptionStore | None = None, allow_dev_receipts: bool = True) -> None:
        self.store = store or InMemorySubscriptionStore()
        self.allow_dev_receipts = allow_dev_receipts

    def get_current(self, user_id: str) -> dict:
        subscription = self.store.get(user_id)
        return self._response(subscription)

    def checkout_metadata(self) -> dict:
        return {
            "provider": "app_store",
            "product_ids": STOREKIT_PRODUCT_IDS,
        }

    def restore_app_store_purchase(
        self,
        user_id: str,
        provider: str,
        product_id: str,
        receipt: str,
    ) -> dict:
        if provider != "app_store" or not receipt:
            return {"error": "invalid_restore_payload"}
        plan = PRODUCT_TO_PLAN.get(product_id)
        if plan is None:
            return {"error": "unknown_product_id"}
        if not self.allow_dev_receipts:
            return {"error": "subscription_provider_not_configured"}
        subscription = StoredSubscription(
            user_id=user_id,
            plan=plan,
            status="active",
            provider="app_store",
            provider_subscription_id=product_id,
            renews_at=datetime.now(timezone.utc) + timedelta(days=30),
        )
        return self._response(self.store.save(subscription))

    def decide_fair_use(self, plan: str, purpose: str, daily_usage_count: int) -> dict:
        thresholds = self._fair_use_thresholds.get(plan, self._fair_use_thresholds["free"])
        threshold = thresholds.get(purpose, thresholds["chat"])
        if daily_usage_count >= threshold:
            return {"allowed": False, "reason": "upgrade_or_wait"}
        return {"allowed": True, "reason": "ok"}

    def _response(self, subscription: StoredSubscription) -> dict:
        return {
            "plan": subscription.plan,
            "status": subscription.status,
            "renews_at": subscription.renews_at.isoformat() if subscription.renews_at else None,
            "entitlements": self._entitlements(subscription.plan),
        }

    def _entitlements(self, plan: str) -> dict:
        if plan == "elite":
            return {
                "automatic_recording": True,
                "memory_retention": "extended",
                "priority_analysis": True,
                "deep_review": True,
                "high_confidence_auto_confirm": True,
            }
        if plan == "pro":
            return {
                "automatic_recording": True,
                "memory_retention": "extended",
                "priority_analysis": True,
                "deep_review": False,
                "high_confidence_auto_confirm": False,
            }
        return {
            "automatic_recording": False,
            "memory_retention": "7_days",
            "priority_analysis": False,
            "deep_review": False,
            "high_confidence_auto_confirm": False,
        }


subscription_service = SubscriptionService()
