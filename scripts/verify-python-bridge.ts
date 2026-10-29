/**
 * Read-only E2E verification of the Python-service bridge integration.
 *
 * Usage:
 *   bun run scripts/verify-python-bridge.ts up     # Python service running → expect reachable
 *   bun run scripts/verify-python-bridge.ts down   # Python service stopped  → expect fallback
 *
 * This script is strictly READ-ONLY for the existing application: it logs
 * in, calls GET endpoints and asserts statuses. It never creates, approves,
 * resets or mutates anything.
 *
 * Verifies:
 *   1. Admin receives a structured health payload (reachable true/false per mode)
 *   2. Anonymous request → 401 (RBAC enforced server-side)
 *   3. Scheduler request → 403 (ADMIN-only diagnostics)
 *   4. Coexistence sanity: existing endpoints (overview/conflicts/audit)
 *      keep answering 200 while the Python service is up or down.
 */
const BASE = 'http://localhost:3000';
const MODE = process.argv[2] === 'down' ? 'down' : 'up';

function jar(): Map<string, string> {
  return new Map();
}

async function req(cookies: Map<string, string>, path: string, init: RequestInit = {}) {
  const cookieHeader = Array.from(cookies.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
  const res = await fetch(BASE + path, {
    ...init,
    redirect: 'manual',
    headers: { 'Content-Type': 'application/json', Cookie: cookieHeader, ...(init.headers ?? {}) },
  });
  const setCookies = res.headers.getSetCookie?.() ?? [];
  for (const c of setCookies) {
    const [pair] = c.split(';');
    const [name, ...rest] = pair.split('=');
    cookies.set(name, rest.join('='));
  }
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text.slice(0, 200) }; }
  return { status: res.status, json };
}

async function login(cookies: Map<string, string>, email: string, password: string) {
  const csrf = await req(cookies, '/api/auth/csrf');
  const token = (csrf.json.csrfToken as string) ?? '';
  const body = `email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}&csrfToken=${encodeURIComponent(token)}&json=true`;
  return req(cookies, '/api/auth/callback/credentials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
}

let failures = 0;
function check(label: string, ok: boolean, extra = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${extra ? ` — ${extra}` : ''}`);
  if (!ok) failures++;
}

async function main() {
  console.log(`\n== Python bridge verification (mode: ${MODE}) ==`);

  // 1. Anonymous → 401
  const anon = await req(jar(), '/api/python-service');
  check('anonymous GET /api/python-service → 401', anon.status === 401, `got ${anon.status}`);

  // 2. Scheduler → 403
  const schedCookies = jar();
  await login(schedCookies, 'scheduler@lpu.edu', 'Schedule@123');
  const sched = await req(schedCookies, '/api/python-service');
  check('scheduler GET /api/python-service → 403', sched.status === 403, `got ${sched.status}`);

  // 3. Admin → structured payload matching the mode
  const adminCookies = jar();
  await login(adminCookies, 'admin@lpu.edu', 'Admin@123');
  const bridge = await req(adminCookies, '/api/python-service');
  check('admin GET /api/python-service → 200', bridge.status === 200, `got ${bridge.status}`);
  const h = bridge.json as Record<string, unknown>;
  check('payload has all contract fields',
    ['reachable', 'status', 'service', 'version', 'latencyMs', 'detail', 'checkedAt']
      .every((k) => k in h));
  check('internal URL never leaked in payload', !JSON.stringify(h).includes('127.0.0.1:8000'));
  if (MODE === 'up') {
    check('reachable === true', h.reachable === true, `status=${String(h.status)}`);
    check('status === healthy', h.status === 'healthy');
    check('service identity', h.service === 'python-scheduling-assistant', String(h.service));
    check('version reported', h.version === '0.1.0', String(h.version));
  } else {
    check('deterministic fallback: reachable === false', h.reachable === false, `status=${String(h.status)}`);
    check('status classified', ['unreachable', 'error', 'timeout'].includes(String(h.status)));
    check('detail explains the failure', typeof h.detail === 'string' && (h.detail as string).length > 0);
  }

  // 4. Coexistence sanity on existing endpoints (read-only)
  const overview = await req(adminCookies, '/api/overview');
  check('existing GET /api/overview still 200', overview.status === 200, `got ${overview.status}`);
  const conflicts = await req(adminCookies, '/api/conflicts');
  check('existing GET /api/conflicts still 200', conflicts.status === 200, `got ${conflicts.status}`);
  const audit = await req(adminCookies, '/api/audit?limit=5');
  check('existing GET /api/audit still 200', audit.status === 200, `got ${audit.status}`);

  console.log(`\n${failures === 0 ? '✅ BRIDGE VERIFICATION PASSED' : `❌ ${failures} CHECK(S) FAILED`} (mode: ${MODE})`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error('\n❌ BRIDGE VERIFICATION FAILED:', err.message);
  process.exit(1);
});

// Mark this file as an ES module so its top-level declarations do not leak
// into the global script scope shared with other files in scripts/.
export {};
