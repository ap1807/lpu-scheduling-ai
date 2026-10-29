"""Live integration tests — require BOTH services to be running:
  * the Python service on 127.0.0.1:8000 (python-service/scripts/service.py start)
  * the Next.js dev server on 127.0.0.1:3000

Run with:  RUN_INTEGRATION=1 python -m pytest tests/test_live_integration.py -v
(skipped otherwise, so plain unit runs stay hermetic).

These tests assert the full authority model of the stage-1 integration:
the Next.js route is ADMIN-gated (401 anonymous / 403 scheduler), and it
reports the Python service health inside a structured JSON payload.
"""

import os

import httpx
import pytest

PY_BASE = os.environ.get("PY_BASE_URL", "http://127.0.0.1:8000")
NEXT_BASE = os.environ.get("NEXT_BASE_URL", "http://127.0.0.1:3000")

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_INTEGRATION") != "1",
    reason="live integration tests need both services running (RUN_INTEGRATION=1)",
)


def _login(client: httpx.Client, email: str, password: str) -> None:
    csrf = client.get(f"{NEXT_BASE}/api/auth/csrf").json()["csrfToken"]
    res = client.post(
        f"{NEXT_BASE}/api/auth/callback/credentials",
        data={"email": email, "password": password, "csrfToken": csrf, "json": "true"},
    )
    assert res.status_code in (200, 302), f"login failed for {email}: {res.status_code}"


def test_direct_python_health():
    res = httpx.get(f"{PY_BASE}/health", timeout=5)
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "healthy"
    assert body["service"] == "python-scheduling-assistant"
    assert body["version"] == "0.1.0"


def test_bridge_reports_healthy_for_admin():
    with httpx.Client(timeout=10) as client:
        _login(client, "admin@lpu.edu", "Admin@123")
        res = client.get(f"{NEXT_BASE}/api/python-service")
        assert res.status_code == 200
        body = res.json()
        assert body["reachable"] is True
        assert body["status"] == "healthy"
        assert body["service"] == "python-scheduling-assistant"
        assert body["version"] == "0.1.0"
        assert isinstance(body["latencyMs"], int) and body["latencyMs"] >= 0
        assert body["detail"]
        assert body["checkedAt"]


def test_bridge_rejects_anonymous():
    res = httpx.get(f"{NEXT_BASE}/api/python-service", timeout=10)
    assert res.status_code == 401


def test_bridge_rejects_scheduler():
    with httpx.Client(timeout=10) as client:
        _login(client, "scheduler@lpu.edu", "Schedule@123")
        res = client.get(f"{NEXT_BASE}/api/python-service")
        assert res.status_code == 403
