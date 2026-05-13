from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.repositories.sqlalchemy.auth import SqlAlchemyAuthRepository
from app.repositories.sqlalchemy.chat import SqlAlchemyChatRepository
from app.repositories.sqlalchemy.model_calls import SqlAlchemyModelCallRepository
from app.repositories.sqlalchemy.profile import SqlAlchemyProfileRepository
from app.repositories.sqlalchemy.records import (
    SqlAlchemyCheckinRepository,
    SqlAlchemyFoodLogRepository,
    SqlAlchemySafetyEventRepository,
    SqlAlchemyWorkoutLogRepository,
)
from app.repositories.sqlalchemy.subscription import SqlAlchemySubscriptionRepository
from app.services.admin_service import AdminService
from app.services.auth_service import AuthService
from app.services.chat_service import ChatService
from app.services.food_service import FoodService
from app.services.privacy_service import PrivacyService
from app.services.profile_service import ProfileService
from app.services.records_service import RecordsService
from app.services.safety_service import SafetyService
from app.services.subscription_service import SubscriptionService
from app.services.workout_service import WorkoutService


_password_reset_tokens: dict[str, str] = {}


DbSession = Annotated[Session, Depends(get_db)]


def get_auth_service(db: DbSession) -> AuthService:
    return AuthService(
        store=SqlAlchemyAuthRepository(db),
        reset_tokens=_password_reset_tokens,
    )


def get_subscription_service(db: DbSession) -> SubscriptionService:
    return SubscriptionService(store=SqlAlchemySubscriptionRepository(db))


def get_profile_service(db: DbSession) -> ProfileService:
    return ProfileService(
        store=SqlAlchemyProfileRepository(db),
        subscription_service=get_subscription_service(db),
    )


def get_chat_service(db: DbSession) -> ChatService:
    return ChatService(store=SqlAlchemyChatRepository(db))


def get_food_service(db: DbSession) -> FoodService:
    subscription = get_subscription_service(db)
    chat = get_chat_service(db)
    return FoodService(
        store=SqlAlchemyFoodLogRepository(db),
        chat_service_dependency=chat,
        subscription_service_dependency=subscription,
    )


def get_privacy_service(db: DbSession) -> PrivacyService:
    return PrivacyService(food_service_dependency=get_food_service(db))


def get_workout_service(db: DbSession) -> WorkoutService:
    return WorkoutService(
        store=SqlAlchemyWorkoutLogRepository(db),
        subscription_service_dependency=get_subscription_service(db),
    )


def get_records_service(db: DbSession) -> RecordsService:
    subscription = get_subscription_service(db)
    profile = ProfileService(
        store=SqlAlchemyProfileRepository(db),
        subscription_service=subscription,
    )
    return RecordsService(
        store=SqlAlchemyCheckinRepository(db),
        food_service_dependency=FoodService(
            store=SqlAlchemyFoodLogRepository(db),
            chat_service_dependency=get_chat_service(db),
            subscription_service_dependency=subscription,
        ),
        workout_service_dependency=WorkoutService(
            store=SqlAlchemyWorkoutLogRepository(db),
            subscription_service_dependency=subscription,
        ),
        profile_service_dependency=profile,
    )


def get_safety_service(db: DbSession) -> SafetyService:
    return SafetyService(store=SqlAlchemySafetyEventRepository(db))


def get_admin_service(db: DbSession) -> AdminService:
    return AdminService(
        safety_service_dependency=get_safety_service(db),
        model_call_repository=SqlAlchemyModelCallRepository(db),
    )


def current_user(
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
    authorization: Annotated[str | None, Header()] = None,
) -> dict:
    if authorization is None or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="not_authenticated",
        )

    token = authorization.split(" ", 1)[1].strip()
    payload = auth_service.verify_access_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid_token",
        )

    user = auth_service.get_user_by_id(str(payload["sub"]))
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid_token",
        )
    return user


CurrentUser = Annotated[dict, Depends(current_user)]
