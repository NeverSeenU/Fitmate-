from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any
import csv
import io
import re
import uuid
import zipfile
import xml.etree.ElementTree as ET

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
FILE_INSIGHT_SCHEMA_VERSION = 1


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
        file_insights = build_file_insights(filename=filename, content=content, content_type=content_type)
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
        upload_response = self._upload_response(upload, file_insights)
        assistant_message = self.chat_service.store.add_message(
            StoredMessage(
                id=str(uuid.uuid4()),
                thread_id=thread_id,
                user_id=user_id,
                role="assistant",
                message_type="file_summary",
                content_text=summary,
                structured_json={"file_upload": upload_response, "file_insights": file_insights},
            )
        )
        return {
            "assistant_message": self.chat_service._message_response(assistant_message),
            "file_upload": upload_response,
        }

    def delete_user_files(self, user_id: str) -> int:
        deleted_count = 0
        for upload in self.store.list_for_user(user_id):
            if self.storage.delete(upload.object_key):
                deleted_count += 1
        return deleted_count

    def _summary(self, filename: str, content: bytes, content_type: str) -> str:
        size_label = self._size_label(len(content))
        parsed = parse_file_preview(filename=filename, content=content, content_type=content_type)
        if parsed:
            return f"已上传并解析 {filename}（{size_label}）。{parsed}"
        return f"已上传 {filename}（{content_type}，{size_label}）。当前版本已保存文件并记录元信息，暂未抽取到可读文本。"

    def _upload_response(self, upload: StoredFileUpload, file_insights: dict | None = None) -> dict:
        data = asdict(upload)
        data["created_at"] = upload.created_at.isoformat()
        data["updated_at"] = upload.updated_at.isoformat()
        if file_insights is not None:
            data["document_type"] = file_insights["document_type"]
            data["insights"] = file_insights["insights"]
            data["recommendations"] = file_insights["recommendations"]
            data["insight_schema_version"] = file_insights["schema_version"]
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


def parse_file_preview(filename: str, content: bytes, content_type: str) -> str:
    if content_type == "text/csv" or filename.lower().endswith(".csv"):
        return _csv_preview(content)
    if content_type == "text/plain" or filename.lower().endswith(".txt"):
        return _text_preview(content)
    if (
        content_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        or filename.lower().endswith(".docx")
    ):
        return _docx_preview(content)
    if (
        content_type == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        or filename.lower().endswith(".xlsx")
    ):
        return _xlsx_preview(content)
    if content_type == "application/pdf" or filename.lower().endswith(".pdf"):
        return _pdf_preview(content)
    return ""


def extract_file_text(filename: str, content: bytes, content_type: str) -> str:
    if content_type == "text/csv" or filename.lower().endswith(".csv"):
        return _clean_text(content.decode("utf-8-sig", errors="replace"))
    if content_type == "text/plain" or filename.lower().endswith(".txt"):
        return _clean_text(content.decode("utf-8", errors="replace"))
    if (
        content_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        or filename.lower().endswith(".docx")
    ):
        return _docx_text(content)
    if (
        content_type == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        or filename.lower().endswith(".xlsx")
    ):
        return _xlsx_text(content)
    if content_type == "application/pdf" or filename.lower().endswith(".pdf"):
        return _pdf_text(content)
    return ""


def build_file_insights(filename: str, content: bytes, content_type: str) -> dict:
    text = extract_file_text(filename=filename, content=content, content_type=content_type)
    searchable = f"{filename} {text}".lower()
    document_type = _document_type(searchable)
    insights = _extract_insights(searchable)
    insights.insert(0, {"label": "document_type", "value": document_type, "source": "heuristic"})
    return {
        "schema_version": FILE_INSIGHT_SCHEMA_VERSION,
        "document_type": document_type,
        "insights": insights[:8],
        "recommendations": _recommendations(document_type, insights),
    }


def _document_type(text: str) -> str:
    type_keywords = {
        "body_report": [
            "bmi",
            "body fat",
            "weight",
            "glucose",
            "cholesterol",
            "blood report",
            "body report",
            "体脂",
            "体重",
            "血糖",
            "血脂",
            "报告",
        ],
        "menu": [
            "menu",
            "meal",
            "breakfast",
            "lunch",
            "dinner",
            "calories",
            "protein",
            "kcal",
            "菜单",
            "早餐",
            "午餐",
            "晚餐",
            "热量",
            "蛋白",
        ],
        "workout_plan": [
            "workout",
            "training",
            "sets",
            "reps",
            "strength",
            "cardio",
            "run",
            "days/week",
            "训练",
            "卧推",
            "深蹲",
            "有氧",
            "无氧",
        ],
    }
    scores = {
        document_type: sum(1 for keyword in keywords if keyword in text)
        for document_type, keywords in type_keywords.items()
    }
    best_type = max(scores, key=lambda key: scores[key])
    return best_type if scores[best_type] > 0 else "general"


def _extract_insights(text: str) -> list[dict[str, str]]:
    specs = [
        ("weight_kg", r"(?:weight|体重)\D{0,12}(\d+(?:\.\d+)?)\s*kg"),
        ("bmi", r"\bbmi\D{0,8}(\d+(?:\.\d+)?)"),
        ("body_fat_percent", r"(?:body fat|体脂)\D{0,12}(\d+(?:\.\d+)?)\s*%"),
        ("protein_g", r"(?:protein|蛋白)\D{0,12}(\d+(?:\.\d+)?)\s*g"),
        ("calories_kcal", r"(?:calories|kcal|热量)\D{0,12}(\d+(?:\.\d+)?)"),
        ("training_frequency", r"(\d+)\s*(?:days/week|天/周|次/周)"),
    ]
    insights: list[dict[str, str]] = []
    for label, pattern in specs:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if not match:
            continue
        value = match.group(1)
        if label == "weight_kg":
            value = f"{value} kg"
        elif label == "body_fat_percent":
            value = f"{value}%"
        elif label == "protein_g":
            value = f"{value}g"
        elif label == "calories_kcal":
            value = f"{value} kcal"
        elif label == "training_frequency":
            value = f"{value} days/week"
        insights.append({"label": label, "value": value, "source": "file_text"})
    return insights


def _recommendations(document_type: str, insights: list[dict[str, str]]) -> list[str]:
    labels = {item["label"] for item in insights}
    if document_type == "body_report":
        recommendations = ["Use abnormal markers as follow-up signals, not as a diagnosis."]
        if "weight_kg" in labels:
            recommendations.append("Sync the weight value to the profile or check-in record before comparing trends.")
        return recommendations
    if document_type == "menu":
        recommendations = ["Check whether total calories and protein match the current fat-loss target."]
        if "protein_g" not in labels:
            recommendations.append("Add protein grams per meal so FitMate can estimate daily protein coverage.")
        return recommendations
    if document_type == "workout_plan":
        return ["Keep the weekly training frequency visible and schedule recovery days around strength sessions."]
    return ["Readable content was extracted; send the key section to FitMate for a more specific analysis."]


def _text_preview(content: bytes) -> str:
    preview = _clean_text(content.decode("utf-8", errors="replace"))[:360]
    return f"文本预览：{preview}" if preview else ""


def _csv_preview(content: bytes) -> str:
    text = content.decode("utf-8-sig", errors="replace")
    rows = list(csv.reader(io.StringIO(text)))
    if not rows:
        return ""
    header = [cell.strip() for cell in rows[0] if cell.strip()]
    sample = "；".join("，".join(cell.strip() for cell in row[:4] if cell.strip()) for row in rows[1:4])
    parts = [f"CSV 结构：{len(rows)} 行，最多 {max(len(row) for row in rows)} 列"]
    if header:
        parts.append(f"字段：{', '.join(header[:8])}")
    if sample:
        parts.append(f"样例：{sample[:240]}")
    return "。".join(parts)


def _docx_preview(content: bytes) -> str:
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            xml = archive.read("word/document.xml")
    except (KeyError, zipfile.BadZipFile):
        return ""
    root = ET.fromstring(xml)
    texts = [node.text or "" for node in root.iter() if node.tag.endswith("}t")]
    preview = _clean_text(" ".join(texts))[:360]
    return f"Word 文档文本预览：{preview}" if preview else ""


def _xlsx_preview(content: bytes) -> str:
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            shared = _xlsx_shared_strings(archive)
            sheet_names = [name for name in archive.namelist() if name.startswith("xl/worksheets/sheet") and name.endswith(".xml")]
            cells: list[str] = []
            for sheet_name in sheet_names[:3]:
                root = ET.fromstring(archive.read(sheet_name))
                for cell in root.iter():
                    if not cell.tag.endswith("}c"):
                        continue
                    value = _xlsx_cell_value(cell, shared)
                    if value:
                        cells.append(value)
                    if len(cells) >= 20:
                        break
                if len(cells) >= 20:
                    break
    except (KeyError, zipfile.BadZipFile, ET.ParseError):
        return ""
    preview = _clean_text("，".join(cells))[:360]
    return f"Excel 表格预览：{preview}" if preview else ""


def _pdf_preview(content: bytes) -> str:
    text = content.decode("latin-1", errors="ignore")
    snippets = re.findall(r"\(([^()]{2,120})\)", text)
    preview = _clean_text(" ".join(_pdf_unescape(item) for item in snippets))[:360]
    return f"PDF 文本预览：{preview}" if preview else ""


def _docx_text(content: bytes) -> str:
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            xml = archive.read("word/document.xml")
    except (KeyError, zipfile.BadZipFile):
        return ""
    try:
        root = ET.fromstring(xml)
    except ET.ParseError:
        return ""
    texts = [node.text or "" for node in root.iter() if node.tag.endswith("}t")]
    return _clean_text(" ".join(texts))


def _xlsx_text(content: bytes) -> str:
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            shared = _xlsx_shared_strings(archive)
            sheet_names = [name for name in archive.namelist() if name.startswith("xl/worksheets/sheet") and name.endswith(".xml")]
            cells: list[str] = []
            for sheet_name in sheet_names[:3]:
                root = ET.fromstring(archive.read(sheet_name))
                for cell in root.iter():
                    if not cell.tag.endswith("}c"):
                        continue
                    value = _xlsx_cell_value(cell, shared)
                    if value:
                        cells.append(value)
                    if len(cells) >= 40:
                        break
                if len(cells) >= 40:
                    break
    except (KeyError, zipfile.BadZipFile, ET.ParseError):
        return ""
    return _clean_text(" ".join(cells))


def _pdf_text(content: bytes) -> str:
    text = content.decode("latin-1", errors="ignore")
    snippets = re.findall(r"\(([^()]{2,120})\)", text)
    return _clean_text(" ".join(_pdf_unescape(item) for item in snippets))


def _xlsx_shared_strings(archive: zipfile.ZipFile) -> list[str]:
    try:
        root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    except KeyError:
        return []
    values = []
    for item in root:
        values.append(_clean_text(" ".join(node.text or "" for node in item.iter() if node.tag.endswith("}t"))))
    return values


def _xlsx_cell_value(cell: ET.Element, shared: list[str]) -> str:
    value_node = next((child for child in cell if child.tag.endswith("}v")), None)
    inline_node = next((child for child in cell if child.tag.endswith("}is")), None)
    if inline_node is not None:
        return _clean_text(" ".join(node.text or "" for node in inline_node.iter() if node.tag.endswith("}t")))
    if value_node is None or value_node.text is None:
        return ""
    if cell.attrib.get("t") == "s":
        index = int(value_node.text)
        return shared[index] if index < len(shared) else ""
    return value_node.text


def _pdf_unescape(value: str) -> str:
    return value.replace(r"\(", "(").replace(r"\)", ")").replace(r"\\", "\\")


def _clean_text(value: str) -> str:
    return " ".join(value.replace("\x00", " ").split())


file_service = FileService()
