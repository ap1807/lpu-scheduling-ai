"""FastAPI application entry point.

Stage 1 is intentionally minimal: health endpoints that the Next.js
server-side bridge queries through its ADMIN-gated route. Conflict-analysis
endpoints will be added in later stages; they will only ever receive
engine-verified payloads posted by the Next.js backend and will remain
advisory — the TypeScript scheduling engine stays the sole authority for
conflict detection and constraint validation.
"""

from fastapi import FastAPI

from .config import Settings
from .schemas.health import HealthResponse, LiveResponse
from .services import health as health_service


def create_app(settings: Settings | None = None) -> FastAPI:
    """Application factory (settings injectable for tests)."""
    settings = settings or Settings()
    app = FastAPI(
        title="LPU Scheduling AI — Python Analysis Service",
        version=settings.version,
        description=settings.description,
    )

    @app.get("/health", response_model=HealthResponse, tags=["health"])
    def health() -> HealthResponse:
        """Readiness report consumed by the Next.js server-side bridge."""
        return HealthResponse.model_validate(
            health_service.build_health(settings.service_name, settings.version)
        )

    @app.get("/health/live", response_model=LiveResponse, tags=["health"])
    def live() -> LiveResponse:
        """Cheap liveness probe (no component checks)."""
        return LiveResponse(status="ok")

    return app


app = create_app()
