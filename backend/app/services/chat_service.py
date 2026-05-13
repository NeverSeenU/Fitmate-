from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any
import uuid


@dataclass
class StoredThread:
    id: str
    user_id: str
    title: str
    kind: str = "general"
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    archived_at: datetime | None = None


@dataclass
class StoredMessage:
    id: str
    thread_id: str
    user_id: str
    role: str
    message_type: str
    content_text: str | None = None
    image_object_key: str | None = None
    structured_json: dict[str, Any] | None = None
    model_provider: str | None = None
    model_name: str | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


class InMemoryChatStore:
    def __init__(self) -> None:
        self.threads_by_id: dict[str, StoredThread] = {}
        self.messages_by_thread_id: dict[str, list[StoredMessage]] = {}

    def create_thread(self, user_id: str, title: str, kind: str) -> StoredThread:
        thread = StoredThread(id=str(uuid.uuid4()), user_id=user_id, title=title, kind=kind)
        self.threads_by_id[thread.id] = thread
        self.messages_by_thread_id[thread.id] = []
        return thread

    def list_threads(self, user_id: str) -> list[StoredThread]:
        return sorted(
            [
                thread
                for thread in self.threads_by_id.values()
                if thread.user_id == user_id and thread.archived_at is None
            ],
            key=lambda thread: thread.updated_at,
            reverse=True,
        )

    def get_thread(self, user_id: str, thread_id: str) -> StoredThread | None:
        thread = self.threads_by_id.get(thread_id)
        if thread is None or thread.user_id != user_id or thread.archived_at is not None:
            return None
        return thread

    def add_message(self, message: StoredMessage) -> StoredMessage:
        self.messages_by_thread_id.setdefault(message.thread_id, []).append(message)
        thread = self.threads_by_id[message.thread_id]
        thread.updated_at = message.created_at
        return message

    def list_messages(self, thread_id: str) -> list[StoredMessage]:
        return self.messages_by_thread_id.get(thread_id, [])


class ChatService:
    def __init__(self, store: InMemoryChatStore | None = None) -> None:
        self.store = store or InMemoryChatStore()

    def create_thread(self, user_id: str, title: str, kind: str) -> dict:
        return self._thread_response(self.store.create_thread(user_id, title, kind))

    def list_threads(self, user_id: str) -> dict:
        return {"threads": [self._thread_response(thread) for thread in self.store.list_threads(user_id)]}

    def list_messages(self, user_id: str, thread_id: str) -> dict | None:
        thread = self.store.get_thread(user_id, thread_id)
        if thread is None:
            return None
        return {
            "thread": self._thread_response(thread),
            "messages": [
                self._message_response(message)
                for message in self.store.list_messages(thread_id)
            ],
        }

    def send_text_message(self, user_id: str, thread_id: str, text: str, context: dict | None) -> dict | None:
        thread = self.store.get_thread(user_id, thread_id)
        if thread is None:
            return None
        self.store.add_message(
            StoredMessage(
                id=str(uuid.uuid4()),
                thread_id=thread_id,
                user_id=user_id,
                role="user",
                message_type="text",
                content_text=text,
                structured_json={"context": context or {}},
            )
        )
        assistant_message = self.store.add_message(
            StoredMessage(
                id=str(uuid.uuid4()),
                thread_id=thread_id,
                user_id=user_id,
                role="assistant",
                message_type="text",
                content_text=self._mock_ai_response(text),
                model_provider="mock",
                model_name="fitmate-contract-mock",
            )
        )
        return {"message": self._message_response(assistant_message), "created_records": []}

    def _mock_ai_response(self, text: str) -> str:
        if "甜" in text or "饿" in text:
            return "先喝水，等 10 分钟；如果还饿，选高蛋白小份。你不是没自控力，是训练后身体需要恢复。"
        return "我先帮你记录重点，再给你一个可执行的小步骤。"

    def _thread_response(self, thread: StoredThread) -> dict:
        data = asdict(thread)
        data["created_at"] = thread.created_at.isoformat()
        data["updated_at"] = thread.updated_at.isoformat()
        data["archived_at"] = thread.archived_at.isoformat() if thread.archived_at else None
        return data

    def _message_response(self, message: StoredMessage) -> dict:
        data = asdict(message)
        data["created_at"] = message.created_at.isoformat()
        return data


chat_service = ChatService()
