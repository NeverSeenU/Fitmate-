from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import models
from app.services.chat_service import StoredMessage, StoredThread


class SqlAlchemyChatRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create_thread(self, user_id: str, title: str, kind: str) -> StoredThread:
        thread = models.ChatThread(user_id=uuid.UUID(user_id), title=title, kind=kind)
        self.session.add(thread)
        self.session.flush()
        return self._stored_thread(thread)

    def list_threads(self, user_id: str) -> list[StoredThread]:
        threads = self.session.scalars(
            select(models.ChatThread)
            .where(
                models.ChatThread.user_id == uuid.UUID(user_id),
                models.ChatThread.archived_at.is_(None),
            )
            .order_by(models.ChatThread.updated_at.desc())
        ).all()
        return [self._stored_thread(thread) for thread in threads]

    def get_thread(self, user_id: str, thread_id: str) -> StoredThread | None:
        thread = self.session.get(models.ChatThread, uuid.UUID(thread_id))
        if thread is None or str(thread.user_id) != user_id or thread.archived_at is not None:
            return None
        return self._stored_thread(thread)

    def add_message(self, message: StoredMessage) -> StoredMessage:
        db_message = models.ChatMessage(
            id=uuid.UUID(message.id),
            thread_id=uuid.UUID(message.thread_id),
            user_id=uuid.UUID(message.user_id),
            role=message.role,
            message_type=message.message_type,
            content_text=message.content_text,
            image_object_key=message.image_object_key,
            structured_json=message.structured_json,
            model_provider=message.model_provider,
            model_name=message.model_name,
        )
        self.session.add(db_message)
        thread = self.session.get(models.ChatThread, uuid.UUID(message.thread_id))
        if thread is not None:
            thread.updated_at = message.created_at
        self.session.flush()
        return self._stored_message(db_message)

    def list_messages(self, thread_id: str) -> list[StoredMessage]:
        messages = self.session.scalars(
            select(models.ChatMessage)
            .where(models.ChatMessage.thread_id == uuid.UUID(thread_id))
            .order_by(models.ChatMessage.created_at.asc())
        ).all()
        return [self._stored_message(message) for message in messages]

    def _stored_thread(self, thread: models.ChatThread) -> StoredThread:
        return StoredThread(
            id=str(thread.id),
            user_id=str(thread.user_id),
            title=thread.title,
            kind=thread.kind,
            created_at=thread.created_at,
            updated_at=thread.updated_at,
            archived_at=thread.archived_at,
        )

    def _stored_message(self, message: models.ChatMessage) -> StoredMessage:
        return StoredMessage(
            id=str(message.id),
            thread_id=str(message.thread_id),
            user_id=str(message.user_id),
            role=message.role,
            message_type=message.message_type,
            content_text=message.content_text,
            image_object_key=message.image_object_key,
            structured_json=message.structured_json,
            model_provider=message.model_provider,
            model_name=message.model_name,
            created_at=message.created_at,
        )
