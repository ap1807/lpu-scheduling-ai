"""Runtime configuration for the Python analysis service.

Every value can be overridden with ``PYTHON_SERVICE_*`` environment
variables. The service binds to the loopback interface by default so it is
reachable only from the Next.js server process on the same host — never
directly from a browser.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="PYTHON_SERVICE_",
        env_file=None,
        extra="ignore",
    )

    service_name: str = "python-scheduling-assistant"
    version: str = "0.1.0"
    description: str = (
        "Advisory analysis service for the LPU scheduling platform. "
        "It analyses and explains engine-verified records supplied by the "
        "Next.js backend; it never validates schedules, never writes data "
        "and never applies timetable changes."
    )
    host: str = "127.0.0.1"
    port: int = 8000
