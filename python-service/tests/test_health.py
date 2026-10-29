"""Unit tests for the health endpoints — fully in-process, no network."""

import re
from datetime import datetime

ISO_UTC_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}")


def test_health_returns_200_and_healthy(client):
    res = client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "healthy"


def test_health_identity_fields(client):
    body = client.get("/health").json()
    assert body["service"] == "python-scheduling-assistant"
    assert body["version"] == "0.1.0"
    assert body["components"]["api"] == "ok"


def test_health_time_is_parseable_iso_utc(client):
    body = client.get("/health").json()
    assert ISO_UTC_RE.match(body["time"])
    parsed = datetime.fromisoformat(body["time"])
    assert parsed.tzinfo is not None  # timezone-aware (UTC)


def test_health_uptime_is_non_negative(client):
    body = client.get("/health").json()
    assert body["uptimeSeconds"] >= 0


def test_health_contract_matches_documented_shape(client):
    """Every field consumed by the Next.js bridge must be present."""
    body = client.get("/health").json()
    for field in ("status", "service", "version", "components", "time", "uptimeSeconds"):
        assert field in body, f"missing contract field: {field}"


def test_live_probe_returns_ok(client):
    res = client.get("/health/live")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_unknown_path_is_404(client):
    assert client.get("/no-such-path").status_code == 404


def test_openapi_documents_health_endpoints(client):
    spec = client.get("/openapi.json").json()
    assert "/health" in spec["paths"]
    assert "/health/live" in spec["paths"]
