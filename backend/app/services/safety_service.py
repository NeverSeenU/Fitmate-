from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
import uuid


@dataclass
class StoredSafetyEvent:
    id: str
    user_id: str | None
    risk_type: str
    severity: str
    action_taken: str
    metadata: dict
    source_message_id: str | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


class InMemorySafetyEventStore:
    def __init__(self) -> None:
        self.events_by_id: dict[str, StoredSafetyEvent] = {}

    def create(self, event: StoredSafetyEvent) -> StoredSafetyEvent:
        self.events_by_id[event.id] = event
        return event

    def list_events(self) -> list[StoredSafetyEvent]:
        return sorted(self.events_by_id.values(), key=lambda event: event.created_at, reverse=True)


class SafetyService:
    def __init__(self, store: InMemorySafetyEventStore | None = None) -> None:
        self.store = store or InMemorySafetyEventStore()

    def disclaimer(self) -> dict:
        return {
            "version": "2026-05-07",
            "disclaimer_en": (
                "FitMate AI provides lifestyle coaching only, not medical diagnosis, "
                "therapy, eating disorder treatment, or prescription advice."
            ),
            "disclaimer_zh": "FitMate AI 只提供生活方式建议，不提供医疗诊断、治疗、进食障碍治疗或处方建议。",
        }

    def classify(self, user_id: str, text: str, source_message_id: str | None = None) -> dict:
        risk = self._risk(text)
        event_id = None
        if risk["risk_type"] != "none":
            event = self.store.create(
                StoredSafetyEvent(
                    id=str(uuid.uuid4()),
                    user_id=user_id,
                    source_message_id=source_message_id,
                    risk_type=risk["risk_type"],
                    severity=risk["severity"],
                    action_taken=risk["action_taken"],
                    metadata={"matched_terms": risk["matched_terms"]},
                )
            )
            event_id = event.id
        return {
            "risk_type": risk["risk_type"],
            "severity": risk["severity"],
            "action_taken": risk["action_taken"],
            "event_id": event_id,
        }

    def metrics(self) -> dict:
        events = self.store.list_events()
        by_severity: dict[str, int] = {}
        by_risk_type: dict[str, int] = {}
        for event in events:
            by_severity[event.severity] = by_severity.get(event.severity, 0) + 1
            by_risk_type[event.risk_type] = by_risk_type.get(event.risk_type, 0) + 1
        return {
            "total": len(events),
            "by_severity": by_severity,
            "by_risk_type": by_risk_type,
            "latest_events": [self._event_response(event) for event in events[:10]],
        }

    def _risk(self, text: str) -> dict:
        checks = [
            ("purging_or_laxative", "high", ["泻药", "催吐", "吐掉", "purge", "laxative"]),
            ("extreme_restriction", "medium", ["一天只吃一点", "不吃饭", "断食三天", "只喝水"]),
            ("self_harm", "crisis", ["自杀", "不想活", "伤害自己", "kill myself"]),
        ]
        lowered = text.lower()
        for risk_type, severity, terms in checks:
            matched = [term for term in terms if term.lower() in lowered or term in text]
            if matched:
                return {
                    "risk_type": risk_type,
                    "severity": severity,
                    "action_taken": "supportive_safety_redirect",
                    "matched_terms": matched,
                }
        return {
            "risk_type": "none",
            "severity": "none",
            "action_taken": "continue",
            "matched_terms": [],
        }

    def _event_response(self, event: StoredSafetyEvent) -> dict:
        data = asdict(event)
        data["created_at"] = event.created_at.isoformat()
        return data


safety_service = SafetyService()
