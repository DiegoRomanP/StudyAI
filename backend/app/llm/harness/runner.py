"""Run one agent CLI as a child process: argv list, prompt on stdin, hard timeout."""

from __future__ import annotations

import os
import signal
import subprocess
from dataclasses import dataclass


@dataclass(frozen=True)
class CliResult:
    returncode: int
    stdout: str
    stderr: str


def run_cli(
    argv: list[str], *, stdin: str, timeout: float, env: dict[str, str], cwd: str
) -> CliResult:
    """Never through a shell; on timeout the whole process group is killed.

    Raises ``FileNotFoundError`` when the binary is missing and
    ``subprocess.TimeoutExpired`` when ``timeout`` elapses.
    """
    proc = subprocess.Popen(  # noqa: S603 - argv list, no shell
        argv,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
        cwd=cwd,
        env=env,
        start_new_session=True,
    )
    try:
        stdout, stderr = proc.communicate(stdin, timeout=timeout)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(proc.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        try:
            proc.communicate(timeout=5)
        except subprocess.TimeoutExpired:
            # A detached helper (OpenCode's service) may still hold our pipes: stop waiting on them.
            for stream in (proc.stdin, proc.stdout, proc.stderr):
                if stream is not None:
                    stream.close()
            proc.wait()
        raise
    return CliResult(proc.returncode, stdout, stderr)
