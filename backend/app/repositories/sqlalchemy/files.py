from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import models
from app.services.file_service import StoredFileUpload


class SqlAlchemyFileUploadRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create(self, upload: StoredFileUpload) -> StoredFileUpload:
        db_upload = models.UploadedFile(
            id=uuid.UUID(upload.id),
            user_id=uuid.UUID(upload.user_id),
            source_message_id=uuid.UUID(upload.source_message_id) if upload.source_message_id else None,
            object_key=upload.object_key,
            filename=upload.filename,
            content_type=upload.content_type,
            size_bytes=upload.size_bytes,
            status=upload.status,
            summary_text=upload.summary_text,
        )
        self.session.add(db_upload)
        self.session.flush()
        return self._stored(db_upload)

    def list_for_user(self, user_id: str) -> list[StoredFileUpload]:
        rows = self.session.scalars(
            select(models.UploadedFile)
            .where(models.UploadedFile.user_id == uuid.UUID(user_id))
            .order_by(models.UploadedFile.created_at.desc())
        ).all()
        return [self._stored(row) for row in rows]

    def _stored(self, upload: models.UploadedFile) -> StoredFileUpload:
        return StoredFileUpload(
            id=str(upload.id),
            user_id=str(upload.user_id),
            source_message_id=str(upload.source_message_id) if upload.source_message_id else None,
            object_key=upload.object_key,
            filename=upload.filename,
            content_type=upload.content_type,
            size_bytes=upload.size_bytes,
            status=upload.status,
            summary_text=upload.summary_text,
            created_at=upload.created_at,
            updated_at=upload.updated_at,
        )
