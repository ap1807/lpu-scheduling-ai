# Python Analysis Service (FastAPI)

Advisory, sidecar microservice for the LPU University Scheduling Conflict
Detection & Resolution platform. It is **fully isolated** from the existing
TypeScript application: its own directory, its own dependency set, its own
process and its own port. Nothing in the existing Next.js app depends on it
to function — if this service is stopped, every existing feature keeps
working unchanged.

## Responsibility model (non-negotiable)

| Responsibility | Owner | This service may |
|---|---|---|
| Conflict detection, constraint validation, schedule validity | **TypeScript engine** (`src/lib/engine`) | ❌ never declare a schedule valid or invalid |
| Authentication, RBAC, sessions | **NextAuth + `src/lib/session.ts`** | ❌ no auth knowledge; reached only via the Next.js server |
| Database (read & write) | **Prisma + Next.js** | ❌ zero database access — stateless JSON in/out |
| Approving / applying timetable changes | **Administrator via Next.js** | ❌ never approves, never mutates anything |
| Analysis, explanation, analytics over **engine-verified** records | Python service | ✅ that is its only role |

The Next.js backend is the **sole client** of this service. It forwards
engine-confirmed facts and renders Python's advisory output; every proposed
change still flows through the existing deterministic validation and the
administrator-approval workflow.

## Architecture

```
Browser ──(auth cookie)──> Next.js /api/python-service   [ADMIN-gated]
                                │  server-side fetch, 2s timeout,
                                │  deterministic fallback
                                ▼
                     FastAPI @ http://127.0.0.1:8000   (loopback only)
```

* The service binds to `127.0.0.1` — unreachable from any browser (the
  gateway only exposes port 3000 externally).
* `PYTHON_SERVICE_URL` lives in server-side environment configuration only
  and is never shipped to the client bundle.
* The bridge always answers with a structured JSON payload; Python
  unavailability is reported inside the body (`reachable: false`), never as
  an unhandled 5xx.

## Endpoints (stage 1)

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Readiness report consumed by the Next.js bridge |
| GET | `/health/live` | Cheap liveness probe |
| GET | `/openapi.json` · `/docs` | Machine/human API documentation |

`GET /health` response:

```json
{
  "status": "healthy",
  "service": "python-scheduling-assistant",
  "version": "0.1.0",
  "components": { "api": "ok" },
  "time": "2026-10-29T04:00:00.000000+00:00",
  "uptimeSeconds": 12.345
}
```

## Setup

```bash
cd python-service

# Isolated virtual environment (preferred):
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt

# — or, if the runtime already provides the pinned packages:
#    pip install -r requirements-dev.txt
```

`requirements.txt` pins the runtime dependencies; `requirements-dev.txt`
adds pytest + httpx for the test suite.

## Run

```bash
# Start as a detached daemon (survives shell exit; logs → logs/service.log)
python3 scripts/service.py start

# Check the daemon process
python3 scripts/service.py status

# Direct health probe
python3 scripts/service.py probe

# Stop
python3 scripts/service.py stop

# — or run in the foreground (classic dev loop):
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Configuration (environment variables, all optional):

| Variable | Default | Purpose |
|---|---|---|
| `PYTHON_SERVICE_HOST` | `127.0.0.1` | Bind address (keep loopback) |
| `PYTHON_SERVICE_PORT` | `8000` | Bind port |
| `PYTHON_SERVICE_URL` | `http://127.0.0.1:8000` | **Next.js side**: base URL of this service |
| `PYTHON_SERVICE_TIMEOUT_MS` | `2000` | **Next.js side**: bridge fetch timeout |

## Tests

```bash
cd python-service

# Hermetic unit tests (no network, in-process TestClient)
.venv/bin/python -m pytest tests/test_health.py -v

# Live integration tests (both services running):
#   1) python3 scripts/service.py start     # this service on :8000
#   2) Next.js dev server running on :3000
RUN_INTEGRATION=1 .venv/bin/python -m pytest tests/test_live_integration.py -v
```

The Next.js-side bridge tests (timeout, failure, fallback, RBAC) live in the
main project: `tests/python-bridge.test.ts` and
`scripts/verify-python-bridge.ts` (see main `README.md` §19).

## Layout

```
python-service/
├── app/
│   ├── main.py          # FastAPI app factory + endpoints
│   ├── config.py        # pydantic-settings configuration
│   ├── schemas/         # Pydantic contracts (health, later: analysis)
│   └── services/        # Pure business logic (health, later: analysis)
├── scripts/service.py   # start | stop | status | probe daemon manager
├── tests/               # pytest unit + live integration tests
├── requirements.txt     # pinned runtime deps
└── requirements-dev.txt # + pytest / httpx
```

## Roadmap

* **Stage 1 (this)**: skeleton + health endpoints + Next.js bridge.
* **Stage 2**: `POST /conflict-analysis` — Next.js sends engine-verified
  conflict records (e.g. `CFLT-0007`), Python returns structured root-cause
  analysis. Still advisory; validated and approved only through the existing
  workflow.
