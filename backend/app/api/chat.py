from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field

from app.api.deps import CurrentUser, get_chat_service
from app.services.chat_service import ChatService, TextChatUnavailableError
from app.services.usage_service import UsageLimitExceededError


router = APIRouter(prefix="/chat", tags=["chat"])
ChatServiceDependency = Annotated[ChatService, Depends(get_chat_service)]


class CreateThreadRequest(BaseModel):
    title: str = Field(min_length=1, max_length=80)
    kind: str = "general"


class SendTextMessageRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    thread_id: str
    text: str = Field(min_length=1, max_length=4000)
    context: dict[str, Any] | None = None


@router.get("/threads")
def list_threads(user: CurrentUser, service: ChatServiceDependency) -> dict:
    return service.list_threads(user["id"])


@router.post("/threads", status_code=status.HTTP_201_CREATED)
def create_thread(payload: CreateThreadRequest, user: CurrentUser, service: ChatServiceDependency) -> dict:
    return service.create_thread(user_id=user["id"], title=payload.title, kind=payload.kind)


@router.get("/threads/{thread_id}/messages")
def list_messages(thread_id: str, user: CurrentUser, service: ChatServiceDependency) -> dict:
    result = service.list_messages(user_id=user["id"], thread_id=thread_id)
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="thread_not_found")
    return result


@router.post("/messages")
def send_text_message(payload: SendTextMessageRequest, user: CurrentUser, service: ChatServiceDependency) -> dict:
    try:
        result = service.send_text_message(
            user_id=user["id"],
            thread_id=payload.thread_id,
            text=payload.text,
            context=payload.context,
        )
    except TextChatUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "text_chat_unavailable",
                "message": "Text chat AI is not configured for this environment.",
            },
        ) from exc
    except UsageLimitExceededError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "code": "fair_use_limit_reached",
                "purpose": exc.purpose,
                "message": "Daily fair-use limit reached for your current plan.",
            },
        ) from exc
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="thread_not_found")
    return result
