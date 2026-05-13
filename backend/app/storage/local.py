from __future__ import annotations

from app.storage.protocols import StoredObject


class LocalObjectStorage:
    def __init__(self) -> None:
        self._objects: dict[str, tuple[bytes, str]] = {}

    def put(self, key: str, content: bytes, content_type: str) -> StoredObject:
        self._objects[key] = (content, content_type)
        return StoredObject(
            object_key=key,
            content_type=content_type,
            size_bytes=len(content),
        )

    def get_bytes(self, key: str) -> bytes | None:
        stored = self._objects.get(key)
        if stored is None:
            return None
        return stored[0]

    def delete(self, key: str) -> bool:
        return self._objects.pop(key, None) is not None
