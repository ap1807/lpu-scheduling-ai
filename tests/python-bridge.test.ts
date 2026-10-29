/**
 * Bridge unit tests for src/lib/python-service.ts (server-side Python bridge).
 *
 * Verifies the deterministic fallback contract with fully controlled local
 * servers — no real Python service, no Next.js server, no network access
 * beyond loopback. This file is additive; the 30 engine tests in
 * tests/engine.test.ts remain the untouched regression baseline.
 */
// @ts-expect-error — 'bun:test' types are provided at runtime by bun; tsconfig
// intentionally does not register bun-types (same pattern as tests/engine.test.ts).
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import http from 'node:http';
import net from 'node:net';
import type { AddressInfo } from 'node:net';
import { fetchPythonServiceHealth, type PythonServiceHealth } from '../src/lib/python-service';

const HEALTHY_BODY = JSON.stringify({
  status: 'healthy',
  service: 'python-scheduling-assistant',
  version: '0.1.0',
  components: { api: 'ok' },
  time: new Date().toISOString(),
  uptimeSeconds: 1.5,
});

let healthyServer: http.Server;
let errorServer: http.Server; // always answers HTTP 500
let garbageServer: http.Server; // 200 with non-JSON body
let badStatusServer: http.Server; // 200 with status !== healthy
let hangServer: http.Server; // accepts requests, never responds
const hangSockets = new Set<net.Socket>();

function portOf(server: http.Server): string {
  return String((server.address() as AddressInfo).port);
}

function baseUrl(server: http.Server): string {
  return `http://127.0.0.1:${portOf(server)}`;
}

let savedUrl: string | undefined;
let savedTimeout: string | undefined;

beforeAll(() => {
  savedUrl = process.env.PYTHON_SERVICE_URL;
  savedTimeout = process.env.PYTHON_SERVICE_TIMEOUT_MS;

  healthyServer = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(HEALTHY_BODY);
  });
  errorServer = http.createServer((_req, res) => {
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end('internal error');
  });
  garbageServer = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('this is not json');
  });
  badStatusServer = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'degraded' }));
  });
  hangServer = http.createServer((_req, res) => {
    // deliberately never respond; keep a handle on sockets so we can clean up
    void res;
  });
  hangServer.on('connection', (socket) => {
    hangSockets.add(socket);
    socket.on('close', () => hangSockets.delete(socket));
  });

  return Promise.all(
    [healthyServer, errorServer, garbageServer, badStatusServer, hangServer].map(
      (s) => new Promise<void>((resolve) => s.listen(0, '127.0.0.1', () => resolve())),
    ),
  ) as unknown as Promise<void>;
});

afterAll(() => {
  process.env.PYTHON_SERVICE_URL = savedUrl;
  process.env.PYTHON_SERVICE_TIMEOUT_MS = savedTimeout;
  for (const socket of hangSockets) socket.destroy();
  return Promise.all(
    [healthyServer, errorServer, garbageServer, badStatusServer, hangServer].map(
      (s) => new Promise<void>((resolve) => s.close(() => resolve())),
    ),
  ) as unknown as Promise<void>;
});

describe('fetchPythonServiceHealth — deterministic fallback contract', () => {
  test('healthy service reports reachable with identity and latency', async () => {
    process.env.PYTHON_SERVICE_URL = baseUrl(healthyServer);
    const h: PythonServiceHealth = await fetchPythonServiceHealth(2000);
    expect(h.reachable).toBe(true);
    expect(h.status).toBe('healthy');
    expect(h.service).toBe('python-scheduling-assistant');
    expect(h.version).toBe('0.1.0');
    expect(typeof h.latencyMs).toBe('number');
    expect(h.latencyMs ?? -1).toBeGreaterThanOrEqual(0);
    expect(h.detail).toContain('healthy');
    expect(h.checkedAt).toBeTruthy();
  });

  test('HTTP 500 is classified as error and never throws', async () => {
    process.env.PYTHON_SERVICE_URL = baseUrl(errorServer);
    const h = await fetchPythonServiceHealth(2000);
    expect(h.reachable).toBe(false);
    expect(h.status).toBe('error');
    expect(h.detail).toContain('500');
    expect(h.service).toBeNull();
  });

  test('non-JSON 200 body is classified as error', async () => {
    process.env.PYTHON_SERVICE_URL = baseUrl(garbageServer);
    const h = await fetchPythonServiceHealth(2000);
    expect(h.reachable).toBe(false);
    expect(h.status).toBe('error');
    expect(h.detail).toContain('non-JSON');
  });

  test('unhealthy payload status is rejected (engine-authority preserved)', async () => {
    process.env.PYTHON_SERVICE_URL = baseUrl(badStatusServer);
    const h = await fetchPythonServiceHealth(2000);
    expect(h.reachable).toBe(false);
    expect(h.status).toBe('error');
    expect(h.detail).toContain('degraded');
  });

  test('connection refused is classified as unreachable', async () => {
    // bind then immediately close to get a guaranteed-free port
    const tmp = http.createServer(() => undefined);
    const tmpPort = await new Promise<number>((resolve) => {
      tmp.listen(0, '127.0.0.1', () => resolve((tmp.address() as AddressInfo).port));
    });
    await new Promise<void>((resolve) => tmp.close(() => resolve()));
    process.env.PYTHON_SERVICE_URL = `http://127.0.0.1:${tmpPort}`;
    const h = await fetchPythonServiceHealth(2000);
    expect(h.reachable).toBe(false);
    expect(h.status).toBe('unreachable');
    expect(h.latencyMs).toBeNull();
  });

  test('hanging service trips the timeout within the budget', async () => {
    process.env.PYTHON_SERVICE_URL = baseUrl(hangServer);
    const budgetMs = 250;
    const startedAt = Date.now();
    const h = await fetchPythonServiceHealth(budgetMs);
    const elapsed = Date.now() - startedAt;
    expect(h.reachable).toBe(false);
    expect(h.status).toBe('timeout');
    expect(h.detail).toContain('250');
    expect(elapsed).toBeLessThan(2000); // did not hang the caller
  });
});
