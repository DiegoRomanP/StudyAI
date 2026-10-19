"""EventBus: handlers are de-duplicated and isolated by a SAVEPOINT each."""

import pytest
from fastapi.testclient import TestClient

import main
from app.db.session import SessionLocal
from app.events.session_events import EventBus, SESSION_COMPLETED, SessionCompletedEvent
from app.models.goal import Goal, GoalType


@pytest.fixture(scope="module", autouse=True)
def _app():
    with TestClient(main.app):
        yield


def _event(db) -> SessionCompletedEvent:
    return SessionCompletedEvent(session_id=1, user_id=1, db=db)


def _titles(db) -> set[str]:
    return {g.title for g in db.query(Goal).filter(Goal.title.like("evt-%")).all()}


def _add_goal(db, title: str) -> None:
    db.add(Goal(user_id=1, goal_type=GoalType.LEARNING, title=title, description=""))
    db.flush()


def test_subscribing_same_handler_twice_runs_it_once():
    bus = EventBus()
    calls: list[int] = []

    def handler(event: SessionCompletedEvent) -> None:
        calls.append(event.session_id)

    bus.subscribe(SESSION_COMPLETED, handler)
    bus.subscribe(SESSION_COMPLETED, handler)
    db = SessionLocal()
    try:
        bus.publish(SESSION_COMPLETED, _event(db))
    finally:
        db.close()

    assert calls == [1]


def test_failing_handler_rolls_back_only_its_own_writes():
    bus = EventBus()

    def failing(event: SessionCompletedEvent) -> None:
        _add_goal(event.db, "evt-B")
        raise RuntimeError("boom")

    bus.subscribe(SESSION_COMPLETED, failing)
    db = SessionLocal()
    try:
        _add_goal(db, "evt-A")
        bus.publish(SESSION_COMPLETED, _event(db))
        db.commit()
        assert _titles(db) == {"evt-A"}
        db.query(Goal).filter(Goal.title.like("evt-%")).delete(synchronize_session=False)
        db.commit()
    finally:
        db.close()


def test_failing_handler_does_not_stop_next_handler():
    bus = EventBus()
    seen: list[str] = []

    def failing(event: SessionCompletedEvent) -> None:
        raise RuntimeError("boom")

    def ok(event: SessionCompletedEvent) -> None:
        seen.append("ok")

    bus.subscribe(SESSION_COMPLETED, failing)
    bus.subscribe(SESSION_COMPLETED, ok)
    db = SessionLocal()
    try:
        bus.publish(SESSION_COMPLETED, _event(db))
    finally:
        db.close()

    assert seen == ["ok"]
