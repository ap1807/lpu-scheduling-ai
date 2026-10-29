"""Health-report construction — pure logic, fully unit-testable."""

import time
from datetime import datetime, timezone

_STARTED_AT = time.monotonic()


def build_health(service_name: str, version: str) -> dict:
    """Build a health report dictionary for the given service identity."""
    return {
        "status": "healthy",
        "service": service_name,
        "version": version,
        "components": {"api": "ok"},
        "time": datetime.now(timezone.utc).isoformat(),
        "uptimeSeconds": round(time.monotonic() - _STARTED_AT, 3),
    }
