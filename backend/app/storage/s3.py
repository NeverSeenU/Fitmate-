from __future__ import annotations

from app.storage.protocols import StoredObject


class S3ObjectStorage:
    def __init__(
        self,
        bucket: str,
        *,
        key_prefix: str = "",
        endpoint_url: str | None = None,
        region_name: str | None = None,
        access_key_id: str | None = None,
        secret_access_key: str | None = None,
        client=None,
    ) -> None:
        self.bucket = bucket
        self.key_prefix = key_prefix.strip("/")
        self.client = client or self._create_client(
            endpoint_url=endpoint_url,
            region_name=region_name,
            access_key_id=access_key_id,
            secret_access_key=secret_access_key,
        )

    def put(self, key: str, content: bytes, content_type: str) -> StoredObject:
        object_key = self._object_key(key)
        self.client.put_object(
            Bucket=self.bucket,
            Key=object_key,
            Body=content,
            ContentType=content_type,
        )
        return StoredObject(
            object_key=object_key,
            content_type=content_type,
            size_bytes=len(content),
        )

    def delete(self, key: str) -> bool:
        self.client.delete_object(Bucket=self.bucket, Key=key)
        return True

    def _object_key(self, key: str) -> str:
        clean_key = key.strip("/")
        if not self.key_prefix or clean_key.startswith(f"{self.key_prefix}/"):
            return clean_key
        return f"{self.key_prefix}/{clean_key}"

    def _create_client(
        self,
        *,
        endpoint_url: str | None,
        region_name: str | None,
        access_key_id: str | None,
        secret_access_key: str | None,
    ):
        try:
            import boto3
        except ModuleNotFoundError as exc:
            raise RuntimeError("boto3 is required when OBJECT_STORAGE_DRIVER=s3") from exc

        kwargs = {
            "service_name": "s3",
            "endpoint_url": endpoint_url or None,
            "region_name": region_name or None,
        }
        if access_key_id and secret_access_key:
            kwargs["aws_access_key_id"] = access_key_id
            kwargs["aws_secret_access_key"] = secret_access_key
        return boto3.client(**kwargs)
