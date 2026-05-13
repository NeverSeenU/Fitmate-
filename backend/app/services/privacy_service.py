from __future__ import annotations

from datetime import datetime, timezone
import uuid


class PrivacyService:
    def __init__(self, food_service_dependency: object | None = None) -> None:
        self.food_service = food_service_dependency

    def create_export_job(self, user_id: str) -> dict:
        return {
            "export_job_id": str(uuid.uuid4()),
            "user_id": user_id,
            "status": "queued",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

    def schedule_photo_deletion(self, user_id: str) -> dict:
        job = self._scheduled_job(user_id=user_id, scope="food_photos")
        if self.food_service is not None:
            job["deleted_photo_count"] = self.food_service.delete_user_photos(user_id)
        return job

    def schedule_account_deletion(self, user_id: str) -> dict:
        return self._scheduled_job(user_id=user_id, scope="account")

    def _scheduled_job(self, user_id: str, scope: str) -> dict:
        return {
            "deletion_job_id": str(uuid.uuid4()),
            "user_id": user_id,
            "scope": scope,
            "status": "scheduled",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }


privacy_service = PrivacyService()
