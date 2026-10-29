#!/usr/bin/env python3
"""Process manager for the Python analysis service.

Commands:
    start    Launch uvicorn as a detached daemon (double-fork + setsid, PPID 1)
             so it survives the sandbox's process-tree reaping, mirroring the
             proven pattern of scripts/dev-daemon.py in the main project.
    stop     Terminate the daemon via the PID file (SIGTERM, SIGKILL fallback).
    status   Report whether the daemon process is alive.
    probe    Perform an HTTP GET /health with a 2s timeout and print the body.

The service binds to 127.0.0.1:8000 by default (PYTHON_SERVICE_HOST /
PYTHON_SERVICE_PORT) — loopback only, so it can never be reached directly
from a browser; the Next.js server-side bridge is the only intended client.
"""

import argparse
import http.client
import json
import os
import signal
import sys
import time

SERVICE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PID_FILE = os.path.join(SERVICE_DIR, "service.pid")
LOG_DIR = os.path.join(SERVICE_DIR, "logs")
LOG_FILE = os.path.join(LOG_DIR, "service.log")

HOST = os.environ.get("PYTHON_SERVICE_HOST", "127.0.0.1")
PORT = int(os.environ.get("PYTHON_SERVICE_PORT", "8000"))


def _resolve_python() -> str:
    """Prefer the service's own isolated venv when it exists."""
    venv_py = os.path.join(SERVICE_DIR, ".venv", "bin", "python")
    return venv_py if os.path.exists(venv_py) else (sys.executable or "python3")


def _read_pid():
    try:
        with open(PID_FILE) as f:
            return int(f.read().strip())
    except (OSError, ValueError):
        return None


def _alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def start() -> int:
    pid = _read_pid()
    if pid and _alive(pid):
        print(f"already running (pid {pid})")
        return 0

    # ---- first fork: parent returns immediately ----
    if os.fork() > 0:
        print("daemonizer: started")
        return 0

    os.setsid()  # new session, no controlling terminal

    # ---- second fork: grandchild is reparented to init ----
    if os.fork() > 0:
        os._exit(0)

    os.chdir(SERVICE_DIR)
    os.makedirs(LOG_DIR, exist_ok=True)
    with open("/dev/null", "rb") as r, open(LOG_FILE, "ab") as w:
        os.dup2(r.fileno(), 0)
        os.dup2(w.fileno(), 1)
        os.dup2(w.fileno(), 2)

    # Write the PID before exec: the exec'd uvicorn keeps this PID.
    with open(PID_FILE, "w") as f:
        f.write(str(os.getpid()))

    py = _resolve_python()
    os.execvp(
        py,
        [py, "-m", "uvicorn", "app.main:app", "--host", HOST, "--port", str(PORT)],
    )
    return 1  # unreachable on success


def stop() -> int:
    pid = _read_pid()
    if not pid:
        print("not running")
        return 0
    if not _alive(pid):
        os.remove(PID_FILE)
        print("not running (stale pid file removed)")
        return 0
    os.kill(pid, signal.SIGTERM)
    for _ in range(60):
        if not _alive(pid):
            break
        time.sleep(0.1)
    else:
        os.kill(pid, signal.SIGKILL)
        time.sleep(0.2)
    if os.path.exists(PID_FILE):
        os.remove(PID_FILE)
    print(f"stopped (pid {pid})")
    return 0


def status() -> int:
    pid = _read_pid()
    running = bool(pid and _alive(pid))
    print(json.dumps({"running": running, "pid": pid, "host": HOST, "port": PORT}))
    return 0


def probe() -> int:
    try:
        conn = http.client.HTTPConnection(HOST, PORT, timeout=2)
        conn.request("GET", "/health")
        res = conn.getresponse()
        body = res.read().decode("utf-8", "replace")
        conn.close()
        print(f"HTTP {res.status} {body}")
        return 0 if res.status == 200 else 1
    except OSError as e:
        print(f"probe failed: {e}")
        return 1


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("command", choices=["start", "stop", "status", "probe"])
    args = parser.parse_args()
    return {"start": start, "stop": stop, "status": status, "probe": probe}[args.command]()


if __name__ == "__main__":
    sys.exit(main())
