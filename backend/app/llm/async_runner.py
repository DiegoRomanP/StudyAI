"""Run provider coroutines on one process-wide event loop from the synchronous LLM API."""

from __future__ import annotations

import asyncio
from concurrent.futures import Future
from threading import Lock, Thread
from typing import Any, Coroutine, TypeVar

T = TypeVar("T")


class AsyncRunner:
    """Own an event loop so synchronous callers can use cancellable I/O."""

    def __init__(self) -> None:
        self._loop = asyncio.new_event_loop()
        self._thread = Thread(target=self._run_loop, daemon=True)
        self._closed = False
        self._lock = Lock()
        self._thread.start()

    def run(self, coroutine: Coroutine[Any, Any, T]) -> T:
        with self._lock:
            if self._closed:
                coroutine.close()
                raise RuntimeError("El ejecutor asíncrono de LLM ya está cerrado.")
            try:
                future: Future[T] = asyncio.run_coroutine_threadsafe(coroutine, self._loop)
            except RuntimeError:
                coroutine.close()
                raise RuntimeError("El ejecutor asíncrono de LLM no acepta más operaciones.") from None
        return future.result()

    def close(self) -> None:
        with self._lock:
            if self._closed:
                return
            self._closed = True
        self._cancel_pending()
        self._loop.call_soon_threadsafe(self._loop.stop)
        self._thread.join()
        self._loop.close()

    def _cancel_pending(self) -> None:
        async def cancel_pending() -> None:
            current = asyncio.current_task()
            pending = [task for task in asyncio.all_tasks() if task is not current]
            for task in pending:
                task.cancel()
            if pending:
                await asyncio.gather(*pending, return_exceptions=True)

        future = asyncio.run_coroutine_threadsafe(cancel_pending(), self._loop)
        future.result()

    def _run_loop(self) -> None:
        asyncio.set_event_loop(self._loop)
        self._loop.run_forever()


_runner: AsyncRunner | None = None
_runner_lock = Lock()


def get_async_runner() -> AsyncRunner:
    """Return the process-wide loop used by short-lived provider instances."""
    global _runner
    with _runner_lock:
        if _runner is None:
            _runner = AsyncRunner()
        return _runner


def shutdown_async_runner() -> None:
    """Cancel pending LLM I/O and release the shared event loop at shutdown."""
    global _runner
    with _runner_lock:
        runner = _runner
        _runner = None
    if runner is not None:
        runner.close()
