from __future__ import annotations

from datetime import date, datetime, time, timezone
from decimal import Decimal
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import models
from app.services.food_service import StoredFoodLog
from app.services.records_service import StoredCheckin
from app.services.safety_service import StoredSafetyEvent
from app.services.workout_service import StoredWorkoutLog


class SqlAlchemyFoodLogRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create(self, log: StoredFoodLog) -> StoredFoodLog:
        db_log = models.FoodLog(
            id=uuid.UUID(log.id),
            user_id=uuid.UUID(log.user_id),
            source_message_id=_optional_uuid(log.source_message_id),
            image_object_key=log.image_object_key,
            meal_name=log.meal_name,
            calories_min=_range_item(log.calories_range_kcal, 0),
            calories_max=_range_item(log.calories_range_kcal, 1),
            protein_min=_decimal_range_item(log.protein_g_range, 0),
            protein_max=_decimal_range_item(log.protein_g_range, 1),
            carbs_min=_decimal_range_item(log.carbs_g_range, 0),
            carbs_max=_decimal_range_item(log.carbs_g_range, 1),
            fat_min=_decimal_range_item(log.fat_g_range, 0),
            fat_max=_decimal_range_item(log.fat_g_range, 1),
            confidence=Decimal(str(log.confidence)),
            status=log.status,
            needs_follow_up=log.needs_follow_up,
            follow_up_question=log.follow_up_question,
            user_portion_note=log.user_portion_note,
            model_provider=log.model_provider,
            model_name=log.model_name,
        )
        self.session.add(db_log)
        self.session.flush()
        return self._stored(db_log)

    def get_for_user(self, user_id: str, food_log_id: str) -> StoredFoodLog | None:
        db_log = self.session.get(models.FoodLog, uuid.UUID(food_log_id))
        if db_log is None or str(db_log.user_id) != user_id:
            return None
        return self._stored(db_log)

    def list_for_user(self, user_id: str, target_date: date | None = None) -> list[StoredFoodLog]:
        query = select(models.FoodLog).where(models.FoodLog.user_id == uuid.UUID(user_id))
        if target_date is not None:
            start, end = _day_bounds(target_date)
            query = query.where(models.FoodLog.created_at >= start, models.FoodLog.created_at < end)
        logs = self.session.scalars(query.order_by(models.FoodLog.created_at.desc())).all()
        return [self._stored(log) for log in logs]

    def save(self, log: StoredFoodLog) -> StoredFoodLog:
        db_log = self.session.get(models.FoodLog, uuid.UUID(log.id))
        if db_log is None:
            return self.create(log)

        db_log.meal_name = log.meal_name
        db_log.calories_min = _range_item(log.calories_range_kcal, 0)
        db_log.calories_max = _range_item(log.calories_range_kcal, 1)
        db_log.protein_min = _decimal_range_item(log.protein_g_range, 0)
        db_log.protein_max = _decimal_range_item(log.protein_g_range, 1)
        db_log.carbs_min = _decimal_range_item(log.carbs_g_range, 0)
        db_log.carbs_max = _decimal_range_item(log.carbs_g_range, 1)
        db_log.fat_min = _decimal_range_item(log.fat_g_range, 0)
        db_log.fat_max = _decimal_range_item(log.fat_g_range, 1)
        db_log.confidence = Decimal(str(log.confidence))
        db_log.status = log.status
        db_log.needs_follow_up = log.needs_follow_up
        db_log.follow_up_question = log.follow_up_question
        db_log.user_portion_note = log.user_portion_note
        db_log.model_provider = log.model_provider
        db_log.model_name = log.model_name
        self.session.flush()
        return self._stored(db_log)

    def delete(self, user_id: str, food_log_id: str) -> bool:
        db_log = self.session.get(models.FoodLog, uuid.UUID(food_log_id))
        if db_log is None or str(db_log.user_id) != user_id:
            return False
        self.session.delete(db_log)
        self.session.flush()
        return True

    def _stored(self, log: models.FoodLog) -> StoredFoodLog:
        return StoredFoodLog(
            id=str(log.id),
            user_id=str(log.user_id),
            source_message_id=str(log.source_message_id) if log.source_message_id else None,
            image_object_key=log.image_object_key,
            meal_name=log.meal_name,
            calories_range_kcal=_range(log.calories_min, log.calories_max),
            protein_g_range=_range(log.protein_min, log.protein_max),
            carbs_g_range=_range(log.carbs_min, log.carbs_max),
            fat_g_range=_range(log.fat_min, log.fat_max),
            confidence=float(log.confidence or 0),
            status=log.status,
            needs_follow_up=log.needs_follow_up,
            follow_up_question=log.follow_up_question,
            user_portion_note=log.user_portion_note,
            model_provider=log.model_provider,
            model_name=log.model_name,
            created_at=log.created_at,
            updated_at=log.updated_at,
        )


class SqlAlchemyWorkoutLogRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create(self, log: StoredWorkoutLog) -> StoredWorkoutLog:
        db_log = models.WorkoutLog(
            id=uuid.UUID(log.id),
            user_id=uuid.UUID(log.user_id),
            source_message_id=_optional_uuid(log.source_message_id),
            workout_type=log.workout_type,
            duration_minutes=log.duration_minutes,
            intensity=log.intensity,
            calories_burned_min=_range_item(log.calories_burned_range_kcal, 0),
            calories_burned_max=_range_item(log.calories_burned_range_kcal, 1),
            status=log.status,
        )
        self.session.add(db_log)
        self.session.flush()
        return self._stored(db_log)

    def get_for_user(self, user_id: str, workout_log_id: str) -> StoredWorkoutLog | None:
        db_log = self.session.get(models.WorkoutLog, uuid.UUID(workout_log_id))
        if db_log is None or str(db_log.user_id) != user_id:
            return None
        return self._stored(db_log)

    def list_for_user(self, user_id: str, target_date: date | None = None) -> list[StoredWorkoutLog]:
        query = select(models.WorkoutLog).where(models.WorkoutLog.user_id == uuid.UUID(user_id))
        if target_date is not None:
            start, end = _day_bounds(target_date)
            query = query.where(models.WorkoutLog.created_at >= start, models.WorkoutLog.created_at < end)
        logs = self.session.scalars(query.order_by(models.WorkoutLog.created_at.desc())).all()
        return [self._stored(log) for log in logs]

    def save(self, log: StoredWorkoutLog) -> StoredWorkoutLog:
        db_log = self.session.get(models.WorkoutLog, uuid.UUID(log.id))
        if db_log is None:
            return self.create(log)

        db_log.workout_type = log.workout_type
        db_log.duration_minutes = log.duration_minutes
        db_log.intensity = log.intensity
        db_log.calories_burned_min = _range_item(log.calories_burned_range_kcal, 0)
        db_log.calories_burned_max = _range_item(log.calories_burned_range_kcal, 1)
        db_log.status = log.status
        self.session.flush()
        return self._stored(db_log)

    def _stored(self, log: models.WorkoutLog) -> StoredWorkoutLog:
        return StoredWorkoutLog(
            id=str(log.id),
            user_id=str(log.user_id),
            source_message_id=str(log.source_message_id) if log.source_message_id else None,
            workout_type=log.workout_type,
            duration_minutes=log.duration_minutes or 0,
            intensity=log.intensity or "medium",
            calories_burned_range_kcal=_range(log.calories_burned_min, log.calories_burned_max),
            status=log.status,
            created_at=log.created_at,
            updated_at=log.updated_at,
        )


class SqlAlchemyCheckinRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create(self, checkin: StoredCheckin) -> StoredCheckin:
        db_checkin = models.Checkin(
            id=uuid.UUID(checkin.id),
            user_id=uuid.UUID(checkin.user_id),
            weight_kg=checkin.weight_kg,
            hunger_level=checkin.hunger_level,
            mood_level=checkin.mood_level,
            craving_level=checkin.craving_level,
            notes=checkin.notes,
        )
        self.session.add(db_checkin)
        self.session.flush()
        return self._stored(db_checkin)

    def get_for_user(self, user_id: str, checkin_id: str) -> StoredCheckin | None:
        db_checkin = self.session.get(models.Checkin, uuid.UUID(checkin_id))
        if db_checkin is None or str(db_checkin.user_id) != user_id:
            return None
        return self._stored(db_checkin)

    def list_for_user(self, user_id: str, target_date: date | None = None) -> list[StoredCheckin]:
        query = select(models.Checkin).where(models.Checkin.user_id == uuid.UUID(user_id))
        if target_date is not None:
            start, end = _day_bounds(target_date)
            query = query.where(models.Checkin.created_at >= start, models.Checkin.created_at < end)
        checkins = self.session.scalars(query.order_by(models.Checkin.created_at.desc())).all()
        return [self._stored(checkin) for checkin in checkins]

    def save(self, checkin: StoredCheckin) -> StoredCheckin:
        db_checkin = self.session.get(models.Checkin, uuid.UUID(checkin.id))
        if db_checkin is None:
            return self.create(checkin)

        db_checkin.weight_kg = checkin.weight_kg
        db_checkin.hunger_level = checkin.hunger_level
        db_checkin.mood_level = checkin.mood_level
        db_checkin.craving_level = checkin.craving_level
        db_checkin.notes = checkin.notes
        self.session.flush()
        return self._stored(db_checkin)

    def delete(self, user_id: str, checkin_id: str) -> bool:
        db_checkin = self.session.get(models.Checkin, uuid.UUID(checkin_id))
        if db_checkin is None or str(db_checkin.user_id) != user_id:
            return False
        self.session.delete(db_checkin)
        self.session.flush()
        return True

    def _stored(self, checkin: models.Checkin) -> StoredCheckin:
        return StoredCheckin(
            id=str(checkin.id),
            user_id=str(checkin.user_id),
            weight_kg=checkin.weight_kg,
            hunger_level=checkin.hunger_level,
            mood_level=checkin.mood_level,
            craving_level=checkin.craving_level,
            notes=checkin.notes,
            created_at=checkin.created_at,
        )


class SqlAlchemySafetyEventRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create(self, event: StoredSafetyEvent) -> StoredSafetyEvent:
        db_event = models.SafetyEvent(
            id=uuid.UUID(event.id),
            user_id=_optional_uuid(event.user_id),
            source_message_id=_optional_uuid(event.source_message_id),
            risk_type=event.risk_type,
            severity=event.severity,
            action_taken=event.action_taken,
            metadata_json=event.metadata,
        )
        self.session.add(db_event)
        self.session.flush()
        return self._stored(db_event)

    def list_events(self) -> list[StoredSafetyEvent]:
        events = self.session.scalars(
            select(models.SafetyEvent).order_by(models.SafetyEvent.created_at.desc())
        ).all()
        return [self._stored(event) for event in events]

    def _stored(self, event: models.SafetyEvent) -> StoredSafetyEvent:
        return StoredSafetyEvent(
            id=str(event.id),
            user_id=str(event.user_id) if event.user_id else None,
            source_message_id=str(event.source_message_id) if event.source_message_id else None,
            risk_type=event.risk_type,
            severity=event.severity,
            action_taken=event.action_taken,
            metadata=event.metadata_json or {},
            created_at=event.created_at,
        )


def _optional_uuid(value: str | None) -> uuid.UUID | None:
    return uuid.UUID(value) if value else None


def _range_item(values: list[int | float], index: int) -> int | None:
    if len(values) <= index:
        return None
    return int(round(float(values[index])))


def _decimal_range_item(values: list[int | float], index: int) -> Decimal | None:
    if len(values) <= index:
        return None
    return Decimal(str(values[index]))


def _range(low: int | float | Decimal | None, high: int | float | Decimal | None) -> list[int | float]:
    return [_number(low), _number(high)]


def _number(value: int | float | Decimal | None) -> int | float:
    if value is None:
        return 0
    decimal_value = Decimal(str(value))
    if decimal_value == decimal_value.to_integral_value():
        return int(decimal_value)
    return float(decimal_value)


def _day_bounds(target_date: date) -> tuple[datetime, datetime]:
    start = datetime.combine(target_date, time.min, tzinfo=timezone.utc)
    end = datetime.combine(target_date, time.max, tzinfo=timezone.utc)
    return start, end
