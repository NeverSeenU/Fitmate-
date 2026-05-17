from fastapi.testclient import TestClient
import io
import zipfile

from app.main import app


client = TestClient(app)


def auth_headers(email: str) -> dict[str, str]:
    response = client.post(
        "/v1/auth/register",
        json={
            "email": email,
            "password": "StrongPass123",
            "display_name": "File Test",
        },
    )
    assert response.status_code == 201
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def create_thread(headers: dict[str, str]) -> str:
    response = client.post(
        "/v1/chat/threads",
        headers=headers,
        json={"title": "Files", "kind": "files"},
    )
    assert response.status_code == 201
    return response.json()["id"]


def test_file_upload_requires_authentication() -> None:
    response = client.post(
        "/v1/files/upload",
        data={"thread_id": "missing"},
        files={"file": ("report.txt", b"hello", "text/plain")},
    )

    assert response.status_code == 401


def test_file_upload_stores_file_and_returns_text_summary() -> None:
    headers = auth_headers("file-upload@example.com")
    thread_id = create_thread(headers)

    response = client.post(
        "/v1/files/upload",
        headers=headers,
        data={"thread_id": thread_id},
        files={"file": ("report.txt", b"protein 120g\nweight 70kg", "text/plain")},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["file_upload"]["filename"] == "report.txt"
    assert body["file_upload"]["content_type"] == "text/plain"
    assert body["file_upload"]["status"] == "parsed"
    assert "protein 120g" in body["file_upload"]["summary_text"]
    assert body["assistant_message"]["message_type"] == "file_summary"

    messages = client.get(f"/v1/chat/threads/{thread_id}/messages", headers=headers).json()["messages"]
    assert [message["message_type"] for message in messages] == ["file", "file_summary"]


def test_file_upload_parses_csv_docx_xlsx_and_pdf_previews() -> None:
    headers = auth_headers("file-deep-parse@example.com")
    thread_id = create_thread(headers)
    cases = [
        ("menu.csv", b"meal,protein\nlunch,chicken\nsnack,yogurt", "text/csv", "CSV 结构"),
        ("plan.docx", minimal_docx("训练计划 每周三次 力量训练"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Word 文档文本预览"),
        ("body.xlsx", minimal_xlsx(["weight", "70kg", "protein", "120g"]), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Excel 表格预览"),
        ("report.pdf", b"%PDF-1.4\n1 0 obj <<>> stream\n(Blood report protein marker)\nendstream\nendobj", "application/pdf", "PDF 文本预览"),
    ]

    for filename, content, content_type, expected in cases:
        response = client.post(
            "/v1/files/upload",
            headers=headers,
            data={"thread_id": thread_id},
            files={"file": (filename, content, content_type)},
        )

        assert response.status_code == 200
        assert expected in response.json()["file_upload"]["summary_text"]


def test_file_upload_rejects_unsupported_type_and_large_file() -> None:
    headers = auth_headers("file-reject@example.com")
    thread_id = create_thread(headers)

    unsupported = client.post(
        "/v1/files/upload",
        headers=headers,
        data={"thread_id": thread_id},
        files={"file": ("script.exe", b"binary", "application/x-msdownload")},
    )
    assert unsupported.status_code == 415
    assert unsupported.json()["detail"]["code"] == "unsupported_file_type"

    too_large = client.post(
        "/v1/files/upload",
        headers=headers,
        data={"thread_id": thread_id},
        files={"file": ("large.txt", b"x" * (15 * 1024 * 1024 + 1), "text/plain")},
    )
    assert too_large.status_code == 413
    assert too_large.json()["detail"]["code"] == "file_too_large"


def test_file_upload_requires_user_owned_thread() -> None:
    owner_headers = auth_headers("file-owner@example.com")
    other_headers = auth_headers("file-other@example.com")
    thread_id = create_thread(owner_headers)

    response = client.post(
        "/v1/files/upload",
        headers=other_headers,
        data={"thread_id": thread_id},
        files={"file": ("report.txt", b"hello", "text/plain")},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "thread_not_found"


def test_uploaded_files_privacy_deletion_removes_stored_objects() -> None:
    headers = auth_headers("file-delete@example.com")
    thread_id = create_thread(headers)
    upload = client.post(
        "/v1/files/upload",
        headers=headers,
        data={"thread_id": thread_id},
        files={"file": ("report.txt", b"hello", "text/plain")},
    )
    assert upload.status_code == 200

    response = client.delete("/v1/me/files", headers=headers)

    assert response.status_code == 202
    assert response.json()["scope"] == "uploaded_files"
    assert response.json()["deleted_file_count"] == 1


def minimal_docx(text: str) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr(
            "word/document.xml",
            f"""<?xml version="1.0" encoding="UTF-8"?>
            <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
              <w:body><w:p><w:r><w:t>{text}</w:t></w:r></w:p></w:body>
            </w:document>""",
        )
    return buffer.getvalue()


def minimal_xlsx(values: list[str]) -> bytes:
    shared_items = "".join(
        f'<si><t>{value}</t></si>'
        for value in values
    )
    cells = "".join(
        f'<c r="A{index + 1}" t="s"><v>{index}</v></c>'
        for index, _ in enumerate(values)
    )
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr(
            "xl/sharedStrings.xml",
            f"""<?xml version="1.0" encoding="UTF-8"?>
            <sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">{shared_items}</sst>""",
        )
        archive.writestr(
            "xl/worksheets/sheet1.xml",
            f"""<?xml version="1.0" encoding="UTF-8"?>
            <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
              <sheetData><row r="1">{cells}</row></sheetData>
            </worksheet>""",
        )
    return buffer.getvalue()
