# Contributing

Thanks for your interest in improving the LPU Scheduling Conflict Detection & Resolution platform.

## Ground rules

The platform's core value is its **authority model**. Any contribution must preserve it:

1. **The deterministic TypeScript engine stays the sole validity authority.** Never let AI output (LLM or Python service) mark a candidate valid, bypass validation, or write to the official timetable.
2. **Every schedule change flows through human approval.** No automated apply paths.
3. **The Python sidecar stays advisory and isolated.** It may analyze, explain and rank; it never validates, never touches the database, never approves.
4. **No regressions in the existing UX.** The Liquid Glass design system, views, navigation and workflows are stable; UI changes should be additive and respect the tokens in `src/app/globals.css`.

## Development setup

```bash
bun install
bun run db:push
bun run scripts/seed.ts
bun run dev            # http://localhost:3000
```

See the README for demo credentials and the full feature tour.

## Before opening a PR

Run the quality gates and make sure they pass:

```bash
bun test tests/engine.test.ts          # 30 engine tests — must stay green
bun test tests/python-bridge.test.ts   # 6 Python bridge contract tests
bun run lint                           # ESLint
bun run scripts/smoke-test.ts          # golden-path API workflow (requires dev server + seeded DB)
```

If you touched the Python service:

```bash
cd python-service
.venv/bin/python -m pytest tests/test_health.py
RUN_INTEGRATION=1 .venv/bin/python -m pytest tests/test_live_integration.py
```

## Commit style

- Small, focused commits; imperative subject lines ("Add exam-spacing rule to detector").
- Include tests for engine rule changes — every hard/soft conflict type has coverage today; keep it that way.
- Update `README.md` when you add user-visible features or new configuration keys.
