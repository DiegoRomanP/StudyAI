"""Lifecycle tests for the process-wide cancellable LLM event loop."""

from __future__ import annotations

import asyncio
from concurrent.futures import CancelledError
from threading import Event, Thread

from app.llm.async_runner import get_async_runner, shutdown_async_runner


def test_shutdown_cancels_pending_work_and_allows_a_new_runner():
    started = Event()
    finished = Event()

    async def pending() -> None:
        started.set()
        try:
            await asyncio.Event().wait()
        finally:
            finished.set()

    runner = get_async_runner()
    worker = Thread(target=lambda: _run_pending(runner, pending()))
    worker.start()
    assert started.wait(timeout=1)

    shutdown_async_runner()

    worker.join(timeout=1)
    assert not worker.is_alive()
    assert finished.is_set()

    new_runner = get_async_runner()
    assert new_runner is not runner
    assert new_runner.run(_value()) == "ok"
    shutdown_async_runner()


def _run_pending(runner, coroutine) -> None:
    try:
        runner.run(coroutine)
    except CancelledError:
        pass


async def _value() -> str:
    return "ok"
