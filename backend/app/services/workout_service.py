from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import date, datetime, timezone
import re
import uuid

from app.services.subscription_service import subscription_service
from app.services.usage_service import usage_service


@dataclass
class StoredWorkoutLog:
    id: str
    user_id: str
    workout_type: str
    duration_minutes: int
    intensity: str
    calories_burned_range_kcal: list[int]
    status: str
    source_message_id: str | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


class InMemoryWorkoutLogStore:
    def __init__(self) -> None:
        self.logs_by_id: dict[str, StoredWorkoutLog] = {}

    def create(self, log: StoredWorkoutLog) -> StoredWorkoutLog:
        self.logs_by_id[log.id] = log
        return log

    def get_for_user(self, user_id: str, workout_log_id: str) -> StoredWorkoutLog | None:
        log = self.logs_by_id.get(workout_log_id)
        if log is None or log.user_id != user_id:
            return None
        return log

    def list_for_user(self, user_id: str, target_date: date | None = None) -> list[StoredWorkoutLog]:
        logs = [log for log in self.logs_by_id.values() if log.user_id == user_id]
        if target_date is not None:
            logs = [log for log in logs if log.created_at.date() == target_date]
        return sorted(logs, key=lambda log: log.created_at, reverse=True)

    def save(self, log: StoredWorkoutLog) -> StoredWorkoutLog:
        log.updated_at = datetime.now(timezone.utc)
        self.logs_by_id[log.id] = log
        return log


class WorkoutService:
    def __init__(
        self,
        store: InMemoryWorkoutLogStore | None = None,
        subscription_service_dependency=None,
        usage_service_dependency=None,
    ) -> None:
        self.store = store or InMemoryWorkoutLogStore()
        self.subscription_service = subscription_service_dependency or subscription_service
        self.usage_service = usage_service_dependency or usage_service

    def analyze_text(self, user_id: str, text: str) -> dict:
        self.usage_service.ensure_allowed(user_id, "workout")
        analysis = self._analyze(text)
        subscription = self.subscription_service.get_current(user_id)
        should_auto_record = bool(subscription["entitlements"]["automatic_recording"])

        workout_log = None
        if should_auto_record:
            workout_log = self.store.create(
                StoredWorkoutLog(
                    id=str(uuid.uuid4()),
                    user_id=user_id,
                    workout_type=analysis["workout_type"],
                    duration_minutes=analysis["duration_minutes"],
                    intensity=analysis["intensity"],
                    calories_burned_range_kcal=analysis["calories_burned_range_kcal"],
                    status="pending",
                )
            )

        response = {
            "assistant_message": {
                "role": "assistant",
                "message_type": "workout_analysis",
                "content_text": self._supportive_reply(analysis),
            },
            "workout_analysis": self._analysis_response(analysis, workout_log),
        }
        self.usage_service.increment(user_id, "workout")
        return response

    def list_logs(self, user_id: str, target_date: date | None = None) -> list[dict]:
        return [self._log_response(log) for log in self.store.list_for_user(user_id, target_date)]

    def create_log(self, user_id: str, data: dict) -> dict:
        log = self.store.create(
            StoredWorkoutLog(
                id=str(uuid.uuid4()),
                user_id=user_id,
                workout_type=data["workout_type"],
                duration_minutes=int(data.get("duration_minutes", 0)),
                intensity=data.get("intensity", "medium"),
                calories_burned_range_kcal=data.get("calories_burned_range_kcal") or [0, 0],
                status=data.get("status", "confirmed"),
            )
        )
        return self._log_response(log)

    def confirm(self, user_id: str, workout_log_id: str) -> dict | None:
        log = self.store.get_for_user(user_id, workout_log_id)
        if log is None:
            return None
        log.status = "confirmed"
        return self._log_response(self.store.save(log))

    def patch(self, user_id: str, workout_log_id: str, data: dict) -> dict | None:
        log = self.store.get_for_user(user_id, workout_log_id)
        if log is None:
            return None
        for key in ["workout_type", "intensity", "duration_minutes", "calories_burned_range_kcal"]:
            if key in data:
                setattr(log, key, data[key])
        log.status = "edited"
        return self._log_response(self.store.save(log))

    def _analyze(self, text: str) -> dict:
        durations = [int(value) for value in re.findall(r"(\d+)\s*分", text)]
        duration_minutes = sum(durations) if durations else 30
        intensity = self._intensity(text)
        workout_type = self._workout_type(text)
        calories_range = self._calorie_range(duration_minutes, intensity)
        return {
            "workout_type": workout_type,
            "duration_minutes": duration_minutes,
            "intensity": intensity,
            "calories_burned_range_kcal": calories_range,
        }

    def _workout_type(self, text: str) -> str:
        if "椭圆" in text and "腿" in text:
            return "cardio_plus_strength"
        if "跑" in text:
            return "running"
        if "力量" in text or "练" in text:
            return "strength"
        return "mixed"

    def _intensity(self, text: str) -> str:
        if "高" in text:
            return "high"
        if "轻" in text or "低" in text:
            return "low"
        return "medium"

    def _calorie_range(self, duration_minutes: int, intensity: str) -> list[int]:
        rates = {
            "low": (3, 5),
            "medium": (4, 6),
            "high": (4.5, 7),
        }[intensity]
        return [round(duration_minutes * rates[0]), round(duration_minutes * rates[1])]

    def _supportive_reply(self, analysis: dict) -> str:
        return (
            f"这次训练大约 {analysis['duration_minutes']} 分钟，先补水，"
            "下一餐优先蛋白质，不需要因为训练后饥饿责备自己。"
        )

    def _analysis_response(self, analysis: dict, workout_log: StoredWorkoutLog | None) -> dict:
        return {
            "workout_log_id": workout_log.id if workout_log else None,
            "workout_type": analysis["workout_type"],
            "duration_minutes": analysis["duration_minutes"],
            "intensity": analysis["intensity"],
            "calories_burned_range_kcal": analysis["calories_burned_range_kcal"],
            "status": workout_log.status if workout_log else "analysis_only",
        }

    def _log_response(self, log: StoredWorkoutLog) -> dict:
        data = asdict(log)
        data["created_at"] = log.created_at.isoformat()
        data["updated_at"] = log.updated_at.isoformat()
        return data


workout_service = WorkoutService()
