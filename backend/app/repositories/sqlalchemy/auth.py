from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db import models
from app.services.auth_service import StoredUser


class SqlAlchemyAuthRepository:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.reset_tokens: dict[str, str] = {}

    def create_user(self, email: str, password_hash: str, display_name: str | None) -> StoredUser:
        normalized_email = email.strip().lower()
        user = models.User(
            email=normalized_email,
            password_hash=password_hash,
            status="active",
        )
        profile = models.UserProfile(
            user=user,
            display_name=display_name,
            food_preferences_json={},
            training_baseline_json={},
            risk_flags_json={},
        )
        self.session.add(user)
        self.session.add(profile)
        try:
            self.session.flush()
        except IntegrityError as exc:
            self.session.rollback()
            raise ValueError("email_already_registered") from exc
        return self._stored_user(user)

    def get_user_by_email(self, email: str) -> StoredUser | None:
        normalized_email = email.strip().lower()
        user = self.session.scalar(
            select(models.User).where(
                models.User.email == normalized_email,
                models.User.deleted_at.is_(None),
            )
        )
        return self._stored_user(user) if user else None

    def get_user_by_id(self, user_id: str) -> StoredUser | None:
        user = self.session.get(models.User, uuid.UUID(user_id))
        if user is None or user.deleted_at is not None:
            return None
        return self._stored_user(user)

    def update_password(self, email: str, password_hash: str) -> bool:
        normalized_email = email.strip().lower()
        user = self.session.scalar(select(models.User).where(models.User.email == normalized_email))
        if user is None:
            return False
        user.password_hash = password_hash
        self.session.flush()
        return True

    def _stored_user(self, user: models.User) -> StoredUser:
        display_name = user.profile.display_name if user.profile else None
        return StoredUser(
            id=str(user.id),
            email=user.email or "",
            display_name=display_name,
            password_hash=user.password_hash,
        )
