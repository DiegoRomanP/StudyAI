"""Session event bus (Observer Pattern).

Decouples "a session was completed" from its side effects (updating SM-2
schedules, future: analytics, notifications). Handlers run synchronously within
the caller's DB transaction, which the event carries; each one inside its own SAVEPOINT.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from app.core.logging import get_logger

if TYPE_CHECKING:  # avoid importing SQLAlchemy at module import time
    from sqlalchemy.orm import Session as DBSession

logger = get_logger(__name__)

SESSION_COMPLETED = "session.completed"


@dataclass
class SessionCompletedEvent:
    session_id: int
    user_id: int
    db: "DBSession"
    # question_id -> SM-2 quality rating (0..5), for flashcards only.
    flashcard_qualities: dict[int, int] = field(default_factory=dict)
    # Set when the completion comes from a graded quiz (not from POST /complete).
    quiz_result_id: int | None = None
    # False for a retake of a session that was already completed.
    first_completion: bool = True


Handler = Callable[[SessionCompletedEvent], None]


class EventBus:
    def __init__(self) -> None:
        self._handlers: dict[str, list[Handler]] = {}

    def subscribe(self, event_type: str, handler: Handler) -> None:
        handlers = self._handlers.setdefault(event_type, [])
        if handler not in handlers:
            handlers.append(handler)

    def publish(self, event_type: str, event: SessionCompletedEvent) -> None:
        for handler in list(self._handlers.get(event_type, [])):
            try:
                # A SAVEPOINT per handler: a failure rolls back only its own writes and
                # leaves the caller's transaction usable for the final commit.
                with event.db.begin_nested():
                    handler(event)
            except Exception:  # noqa: BLE001 - one handler must not break others
                logger.exception("Handler for '%s' failed", event_type)


# Application-wide singleton.
event_bus = EventBus()


def _log_session_completed(event: SessionCompletedEvent) -> None:
    logger.info(
        "session.completed | session=%s user=%s flashcards_rated=%d",
        event.session_id, event.user_id, len(event.flashcard_qualities),
    )


# A harmless default subscriber so the event is observable out of the box.
event_bus.subscribe(SESSION_COMPLETED, _log_session_completed)
