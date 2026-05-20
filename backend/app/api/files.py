from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status

from app.api.deps import CurrentUser, get_file_service
from app.services.file_service import FileService, MAX_FILE_UPLOAD_BYTES, SUPPORTED_FILE_CONTENT_TYPES


router = APIRouter(prefix="/files", tags=["files"])
FileServiceDependency = Annotated[FileService, Depends(get_file_service)]


@router.post("/upload")
async def upload_file(
    user: CurrentUser,
    service: FileServiceDependency,
    thread_id: str = Form(...),
    user_prompt: str | None = Form(default=None),
    file: UploadFile = File(...),
) -> dict:
    if file.content_type not in SUPPORTED_FILE_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail={
                "code": "unsupported_file_type",
                "message": "Supported files are PDF, Word, Excel, CSV, TXT, JPEG, PNG, and WebP.",
            },
        )
    content = await file.read()
    if len(content) > MAX_FILE_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail={
                "code": "file_too_large",
                "message": "File uploads must be 15 MB or smaller.",
            },
        )
    result = service.upload_file(
        user_id=user["id"],
        thread_id=thread_id,
        content=content,
        filename=file.filename or "fitmate-file",
        content_type=file.content_type or "application/octet-stream",
        user_prompt=user_prompt,
    )
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="thread_not_found")
    return result
