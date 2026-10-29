"""Shared pytest fixtures. The TestClient runs the app in-process — no
network or running daemon needed for unit tests."""

import pytest
from fastapi.testclient import TestClient

from app.main import create_app


@pytest.fixture()
def client() -> TestClient:
    return TestClient(create_app())
