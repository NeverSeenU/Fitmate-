from __future__ import annotations

from io import BytesIO

MAX_PROVIDER_IMAGE_SIDE = 1280
PROVIDER_JPEG_QUALITY = 85


class ImageConversionUnavailableError(RuntimeError):
    pass


class ImageConversionError(RuntimeError):
    pass


HEIC_BRANDS = {
    b"heic",
    b"heix",
    b"hevc",
    b"hevx",
    b"mif1",
    b"msf1",
}


def is_heic_image_bytes(image_bytes: bytes) -> bool:
    # ISO BMFF files such as HEIC/HEIF usually declare a major brand near byte 8.
    return len(image_bytes) >= 12 and image_bytes[4:8] == b"ftyp" and image_bytes[8:12] in HEIC_BRANDS


def should_normalize_image_bytes(image_bytes: bytes) -> bool:
    return (
        is_heic_image_bytes(image_bytes)
        or image_bytes.startswith(b"\xff\xd8\xff")
        or image_bytes.startswith(b"\x89PNG\r\n\x1a\n")
        or image_bytes.startswith(b"RIFF") and image_bytes[8:12] == b"WEBP"
    )


def normalize_for_ai_provider(image_bytes: bytes) -> bytes:
    try:
        from PIL import Image
        from PIL import ImageOps
        from pillow_heif import register_heif_opener
    except ImportError as exc:
        raise ImageConversionUnavailableError("image_converter_not_installed") from exc

    try:
        register_heif_opener()
        with Image.open(BytesIO(image_bytes)) as image:
            normalized = ImageOps.exif_transpose(image)
            normalized.thumbnail((MAX_PROVIDER_IMAGE_SIDE, MAX_PROVIDER_IMAGE_SIDE))
            rgb_image = normalized.convert("RGB")
            output = BytesIO()
            rgb_image.save(output, format="JPEG", quality=PROVIDER_JPEG_QUALITY, optimize=True)
            return output.getvalue()
    except Exception as exc:
        raise ImageConversionError("image_conversion_failed") from exc


def jpeg_filename(filename: str | None) -> str:
    if not filename:
        return "food-photo.jpg"
    stem = filename.rsplit(".", 1)[0] if "." in filename else filename
    return f"{stem or 'food-photo'}.jpg"
