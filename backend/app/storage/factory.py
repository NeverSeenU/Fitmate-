from __future__ import annotations

from app.config import Settings
from app.storage.local import LocalObjectStorage
from app.storage.protocols import ObjectStorage
from app.storage.s3 import S3ObjectStorage


_local_storage = LocalObjectStorage()


def create_object_storage(settings: Settings) -> ObjectStorage:
    driver = settings.object_storage_driver.lower()
    if driver == "memory":
        return _local_storage
    if driver == "s3":
        return S3ObjectStorage(
            bucket=settings.object_storage_bucket,
            key_prefix=settings.object_storage_key_prefix,
            endpoint_url=settings.object_storage_endpoint or None,
            region_name=settings.object_storage_region or None,
            access_key_id=settings.object_storage_access_key_id or None,
            secret_access_key=settings.object_storage_secret_access_key or None,
        )
    raise RuntimeError(f"Unsupported OBJECT_STORAGE_DRIVER: {settings.object_storage_driver}")
