from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, runtime_checkable


@dataclass(frozen=True)
class StoredObject:
    object_key: str
    content_type: str
    size_bytes: int


@runtime_checkable
class ObjectStorage(Protocol):
    def put(self, key: str, content: bytes, content_type: str) -> StoredObject: ...

    def delete(self, key: str) -> bool: ...
