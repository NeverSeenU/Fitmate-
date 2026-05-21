from __future__ import annotations

from io import BytesIO


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


def convert_heic_to_jpeg(image_bytes: bytes) -> bytes:
    try:
        from PIL import Image
        from pillow_heif import register_heif_opener
    except ImportError as exc:
        raise ImageConversionUnavailableError("heic_converter_not_installed") from exc

    try:
        register_heif_opener()
        with Image.open(BytesIO(image_bytes)) as image:
            rgb_image = image.convert("RGB")
            output = BytesIO()
            rgb_image.save(output, format="JPEG", quality=90, optimize=True)
            return output.getvalue()
    except Exception as exc:
        raise ImageConversionError("heic_conversion_failed") from exc


def jpeg_filename(filename: str | None) -> str:
    if not filename:
        return "food-photo.jpg"
    stem = filename.rsplit(".", 1)[0] if "." in filename else filename
    return f"{stem or 'food-photo'}.jpg"
