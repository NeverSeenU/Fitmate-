from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import models


@dataclass
class StoredAiModelCall:
    id: str
    user_id: str | None
    provider: str
    model_name: str
    purpose: str
    status: str
    latency_ms: int | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    estimated_cost_cents: int | None = None
    error_code: str | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


class SqlAlchemyModelCallRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create(self, call: StoredAiModelCall) -> StoredAiModelCall:
        db_call = models.AiModelCall(
            id=uuid.UUID(call.id),
            user_id=uuid.UUID(call.user_id) if call.user_id else None,
            provider=call.provider,
            model_name=call.model_name,
            purpose=call.purpose,
            status=call.status,
            latency_ms=call.latency_ms,
            input_tokens=call.input_tokens,
            output_tokens=call.output_tokens,
            estimated_cost_cents=call.estimated_cost_cents,
            error_code=call.error_code,
        )
        self.session.add(db_call)
        self.session.flush()
        return self._stored(db_call)

    def list_recent(self, limit: int = 100) -> list[StoredAiModelCall]:
        calls = self.session.scalars(
            select(models.AiModelCall)
            .order_by(models.AiModelCall.created_at.desc())
            .limit(limit)
        ).all()
        return [self._stored(call) for call in calls]

    def metrics(self) -> dict:
        total_calls = self.session.scalar(select(func.count(models.AiModelCall.id))) or 0
        fallback_calls = self.session.scalar(
            select(func.count(models.AiModelCall.id)).where(models.AiModelCall.purpose == "fallback")
        ) or 0
        estimated_cost_cents = self.session.scalar(
            select(func.coalesce(func.sum(models.AiModelCall.estimated_cost_cents), 0))
        ) or 0
        provider_rows = self.session.execute(
            select(models.AiModelCall.provider, func.count(models.AiModelCall.id))
            .group_by(models.AiModelCall.provider)
            .order_by(models.AiModelCall.provider.asc())
        ).all()
        return {
            "total_calls": int(total_calls),
            "fallback_rate": (float(fallback_calls) / float(total_calls)) if total_calls else 0,
            "estimated_cost_cents": int(estimated_cost_cents),
            "by_provider": {provider: int(count) for provider, count in provider_rows},
        }

    def _stored(self, call: models.AiModelCall) -> StoredAiModelCall:
        return StoredAiModelCall(
            id=str(call.id),
            user_id=str(call.user_id) if call.user_id else None,
            provider=call.provider,
            model_name=call.model_name,
            purpose=call.purpose,
            status=call.status,
            latency_ms=call.latency_ms,
            input_tokens=call.input_tokens,
            output_tokens=call.output_tokens,
            estimated_cost_cents=call.estimated_cost_cents,
            error_code=call.error_code,
            created_at=call.created_at,
        )
