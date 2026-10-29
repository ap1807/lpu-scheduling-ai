"""Health-report schemas (the stage-1 public contract)."""

from pydantic import BaseModel, Field


class HealthComponents(BaseModel):
    """Per-component readiness. Only the API itself exists in stage 1."""

    api: str = Field(default="ok", description="The FastAPI application itself.")


class HealthResponse(BaseModel):
    status: str = Field(description='"healthy" when the service is ready to serve requests.')
    service: str = Field(description="Stable service identifier, e.g. 'python-scheduling-assistant'.")
    version: str = Field(description="Service semantic version.")
    components: HealthComponents
    time: str = Field(description="ISO-8601 UTC timestamp of the report.")
    uptimeSeconds: float = Field(ge=0, description="Seconds since the service process started.")


class LiveResponse(BaseModel):
    status: str = Field(description='"ok" for cheap liveness probes (no component checks).')
