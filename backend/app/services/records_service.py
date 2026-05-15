from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import date, datetime, timezone
from decimal import Decimal
import uuid

from app.services.food_service import food_service
from app.services.profile_service import profile_service
from app.services.workout_service import workout_service


@dataclass
class StoredCheckin:
    id: str
    user_id: str
    weight_kg: Decimal | None = None
    hunger_level: int | None = None
    mood_level: int | None = None
    craving_level: int | None = None
    notes: str | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


class InMemoryCheckinStore:
    def __init__(self) -> None:
        self.checkins_by_id: dict[str, StoredCheckin] = {}

    def create(self, checkin: StoredCheckin) -> StoredCheckin:
        self.checkins_by_id[checkin.id] = checkin
        return checkin

    def get_for_user(self, user_id: str, checkin_id: str) -> StoredCheckin | None:
        checkin = self.checkins_by_id.get(checkin_id)
        if checkin is None or checkin.user_id != user_id:
            return None
        return checkin

    def list_for_user(self, user_id: str, target_date: date | None = None) -> list[StoredCheckin]:
        checkins = [checkin for checkin in self.checkins_by_id.values() if checkin.user_id == user_id]
        if target_date is not None:
            checkins = [checkin for checkin in checkins if checkin.created_at.date() == target_date]
        return sorted(checkins, key=lambda checkin: checkin.created_at, reverse=True)

    def save(self, checkin: StoredCheckin) -> StoredCheckin:
        self.checkins_by_id[checkin.id] = checkin
        return checkin

    def delete(self, user_id: str, checkin_id: str) -> bool:
        checkin = self.get_for_user(user_id, checkin_id)
        if checkin is None:
            return False
        del self.checkins_by_id[checkin_id]
        return True


class RecordsService:
    def __init__(
        self,
        store: InMemoryCheckinStore | None = None,
        food_service_dependency=None,
        workout_service_dependency=None,
        profile_service_dependency=None,
    ) -> None:
        self.store = store or InMemoryCheckinStore()
        self.food_service = food_service_dependency or food_service
        self.workout_service = workout_service_dependency or workout_service
        self.profile_service = profile_service_dependency or profile_service

    def create_checkin(self, user_id: str, data: dict) -> dict:
        checkin = self.store.create(
            StoredCheckin(
                id=str(uuid.uuid4()),
                user_id=user_id,
                weight_kg=data.get("weight_kg"),
                hunger_level=data.get("hunger_level"),
                mood_level=data.get("mood_level"),
                craving_level=data.get("craving_level"),
                notes=data.get("notes"),
            )
        )
        return self._checkin_response(checkin)

    def patch_checkin(self, user_id: str, checkin_id: str, data: dict) -> dict | None:
        checkin = self.store.get_for_user(user_id, checkin_id)
        if checkin is None:
            return None
        for key in ["weight_kg", "hunger_level", "mood_level", "craving_level", "notes"]:
            if key in data:
                setattr(checkin, key, data[key])
        return self._checkin_response(self.store.save(checkin))

    def delete_checkin(self, user_id: str, checkin_id: str) -> bool:
        return self.store.delete(user_id, checkin_id)

    def today(self, user_id: str, target_date: date | None = None) -> dict:
        summary_date = target_date or datetime.now(timezone.utc).date()
        food_logs = [
            log
            for log in self.food_service.list_logs(user_id, summary_date)["food_logs"]
            if log["status"] != "discarded"
        ]
        workout_logs = self.workout_service.list_logs(user_id, summary_date)
        checkins = self.store.list_for_user(user_id, summary_date)
        latest_checkin = checkins[0] if checkins else None
        profile = self.profile_service.store.get(user_id)

        calories_range = self._sum_food_calories(food_logs)
        weight_kg = self._number(latest_checkin.weight_kg) if latest_checkin and latest_checkin.weight_kg else None
        if weight_kg is None and profile is not None:
            weight_kg = self._number(profile.current_weight_kg)

        return {
            "date": summary_date.isoformat(),
            "calories_range_kcal": calories_range,
            "protein_floor_g": self._protein_floor(weight_kg),
            "weight_kg": weight_kg,
            "hunger_score": latest_checkin.hunger_level if latest_checkin else None,
            "mood_score": latest_checkin.mood_level if latest_checkin else None,
            "craving_score": latest_checkin.craving_level if latest_checkin else None,
            "food_logs": food_logs,
            "workout_logs": workout_logs,
            "checkins": [self._checkin_response(checkin) for checkin in checkins],
            "ai_summary": self._summary_text(food_logs, workout_logs, latest_checkin),
        }

    def _sum_food_calories(self, food_logs: list[dict]) -> list[int | float]:
        low = 0
        high = 0
        for log in food_logs:
            calorie_range = log["calories_range_kcal"]
            low += calorie_range[0]
            high += calorie_range[1]
        return [low, high]

    def _protein_floor(self, weight_kg: int | float | None) -> int | None:
        if weight_kg is None:
            return None
        return round(float(weight_kg) * 1.6)

    def _summary_text(self, food_logs: list[dict], workout_logs: list[dict], latest_checkin: StoredCheckin | None) -> str:
        if not food_logs and not workout_logs:
            return "今天先拍照记录第一餐，训练后如果饿，优先补蛋白质和水。"
        if latest_checkin and latest_checkin.hunger_level and latest_checkin.hunger_level >= 7:
            return "今天饥饿感偏高，不要硬扛，下一餐用高蛋白和高纤维把状态稳住。"
        return "今天记录已经开始成形，继续确认待处理记录，别用单餐评价整天表现。"

    def _checkin_response(self, checkin: StoredCheckin) -> dict:
        data = asdict(checkin)
        data["weight_kg"] = self._number(checkin.weight_kg)
        data["created_at"] = checkin.created_at.isoformat()
        return data

    def _number(self, value: Decimal | int | float | None) -> int | float | None:
        if value is None:
            return None
        decimal_value = Decimal(str(value))
        if decimal_value == decimal_value.to_integral_value():
            return int(decimal_value)
        return float(decimal_value)


records_service = RecordsService()
