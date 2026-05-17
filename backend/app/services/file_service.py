from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any
import uuid

from app.services.chat_service import StoredMessage, chat_service
from app.storage.local import LocalObjectStorage
from app.storage.protocols import ObjectStorage


SUPPORTED_FILE_CONTENT_TYPES = {
    "application/pdf",
    "text/plain",
    "text/csv",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "image/jpeg",
    "image/png",
    "image/webp",
}
MAX_FILE_UPLOAD_BYTES = 15 * 1024 * 1024


@dataclass
class StoredFileUpload:
    id: str
    user_id: str
    source_message_id: str | None
    object_key: str
    filename: str
    content_type: str
    size_bytes: int
    status: str
    summary_text: str
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


class InMemoryFileUploadStore:
    def __init__(self) -> None:
        self.uploads_by_id: dict[str, StoredFileUpload] = {}

    def create(self, upload: StoredFileUpload) -> StoredFileUpload:
        self.uploads_by_id[upload.id] = upload
        return upload

    def list_for_user(self, user_id: str) -> list[StoredFileUpload]:
        uploads = [upload for upload in self.uploads_by_id.values() if upload.user_id == user_id]
        return sorted(uploads, key=lambda upload: upload.created_at, reverse=True)


class FileService:
    def __init__(
        self,
        store: InMemoryFileUploadStore | None = None,
        chat_service_dependency: Any | None = None,
        storage: ObjectStorage | None = None,
    ) -> None:
        self.store = store or InMemoryFileUploadStore()
        self.chat_service = chat_service_dependency or chat_service
        self.storage = storage or LocalObjectStorage()

    def upload_file(
        self,
        user_id: str,
        thread_id: str,
        content: bytes,
        filename: str,
        content_type: str,
    ) -> dict | None:
        thread = self.chat_service.store.get_thread(user_id, thread_id)
        if thread is None:
            return None

        object_key = self._object_key(user_id, filename)
        stored = self.storage.put(key=object_key, content=content, content_type=content_type)
        summary = self._summary(filename=filename, content=content, content_type=content_type)
        file_message = self.chat_service.store.add_message(
            StoredMessage(
                id=str(uuid.uuid4()),
                thread_id=thread_id,
                user_id=user_id,
                role="user",
                message_type="file",
                content_text=f"上传文件：{filename}",
                image_object_key=stored.object_key,
                structured_json={
                    "file_object_key": stored.object_key,
                    "filename": filename,
                    "content_type": content_type,
                    "size_bytes": stored.size_bytes,
                },
            )
        )
        upload = self.store.create(
            StoredFileUpload(
                id=str(uuid.uuid4()),
                user_id=user_id,
                source_message_id=file_message.id,
                object_key=stored.object_key,
                filename=filename,
                content_type=content_type,
                size_bytes=stored.size_bytes,
                status="parsed",
                summary_text=summary,
            )
        )
        assistant_message = self.chat_service.store.add_message(
            StoredMessage(
                id=str(uuid.uuid4()),
                thread_id=thread_id,
                user_id=user_id,
                role="assistant",
                message_type="file_summary",
                content_text=summary,
                structured_json={"file_upload": self._upload_response(upload)},
            )
        )
        return {
            "assistant_message": self.chat_service._message_response(assistant_message),
            "file_upload": self._upload_response(upload),
        }

    def delete_user_files(self, user_id: str) -> int:
        deleted_count = 0
        for upload in self.store.list_for_user(user_id):
            if self.storage.delete(upload.object_key):
                deleted_count += 1
        return deleted_count

    def _summary(self, filename: str, content: bytes, content_type: str) -> str:
        size_label = self._size_label(len(content))
        if content_type in {"text/plain", "text/csv"}:
            preview = content.decode("utf-8", errors="replace").strip().replace("\r", " ")
            preview = " ".join(preview.split())[:280]
            if preview:
                return f"已上传并解析 {filename}（{size_label}）。摘要预览：{preview}"
        return f"已上传 {filename}（{content_type}，{size_label}）。当前版本已保存文件并记录元信息，深度内容解析会在下一阶段接入。"

    def _upload_response(self, upload: StoredFileUpload) -> dict:
        data = asdict(upload)
        data["created_at"] = upload.created_at.isoformat()
        data["updated_at"] = upload.updated_at.isoformat()
        return data

    def _object_key(self, user_id: str, filename: str) -> str:
        safe_filename = filename or "fitmate-file"
        return f"user-files/{user_id}/{uuid.uuid4()}-{safe_filename}"

    def _size_label(self, size_bytes: int) -> str:
        if size_bytes < 1024:
            return f"{size_bytes} B"
        if size_bytes < 1024 * 1024:
            return f"{size_bytes / 1024:.1f} KB"
        return f"{size_bytes / (1024 * 1024):.1f} MB"


file_service = FileService()
