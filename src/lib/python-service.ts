/**
 * SERVER-ONLY bridge to the Python analysis service (python-service/).
 *
 * Never import this module from client components: the base URL is internal
 * infrastructure configuration and must not reach the browser. It is only
 * imported by server-side API route handlers.
 *
 * Authority model (unchanged): the TypeScript scheduling engine remains the
 * sole authority for conflict detection and constraint validation. The Python
 * service is advisory only. Nothing in the existing application depends on
 * it — this bridge degrades deterministically whenever the service is
 * stopped, slow or broken, and never throws to the caller.
 */

export type PythonServiceStatus = 'healthy' | 'unreachable' | 'error' | 'timeout';

export interface PythonServiceHealth {
  /** Whether the Python service answered with a healthy report. */
  reachable: boolean;
  /** Deterministic outcome classification of the probe. */
  status: PythonServiceStatus;
  /** Service identity reported by Python (null when unreachable). */
  service: string | null;
  /** Service version reported by Python (null when unreachable). */
  version: string | null;
  /** Round-trip latency in ms (null when unreachable). */
  latencyMs: number | null;
  /** Human-readable explanation of the outcome, safe for ADMIN diagnostics. */
  detail: string;
  /** ISO-8601 UTC timestamp of this report. */
  checkedAt: string;
}

export const PYTHON_SERVICE_DEFAULT_URL = 'http://127.0.0.1:8000';
export const PYTHON_SERVICE_DEFAULT_TIMEOUT_MS = 2000;

function normalizeBase(base: string): string {
  return base.replace(/\/+$/, '');
}

export function pythonServiceUrl(): string {
  return normalizeBase(process.env.PYTHON_SERVICE_URL ?? PYTHON_SERVICE_DEFAULT_URL);
}

export function pythonServiceTimeoutMs(): number {
  const raw = Number(process.env.PYTHON_SERVICE_TIMEOUT_MS ?? PYTHON_SERVICE_DEFAULT_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : PYTHON_SERVICE_DEFAULT_TIMEOUT_MS;
}

function fallback(status: PythonServiceStatus, detail: string): PythonServiceHealth {
  return {
    reachable: false,
    status,
    service: null,
    version: null,
    latencyMs: null,
    detail,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Probe the Python service health endpoint with a hard timeout and a
 * deterministic fallback outcome. Never throws.
 */
export async function fetchPythonServiceHealth(
  timeoutMs: number = pythonServiceTimeoutMs(),
): Promise<PythonServiceHealth> {
  const url = `${pythonServiceUrl()}/health`;
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      cache: 'no-store',
      headers: { accept: 'application/json' },
    });
    const latencyMs = Date.now() - startedAt;
    if (!res.ok) {
      return fallback('error', `Python service responded with HTTP ${res.status}`);
    }
    let body: Record<string, unknown>;
    try {
      body = (await res.json()) as Record<string, unknown>;
    } catch {
      return fallback('error', 'Python service returned a non-JSON response');
    }
    if (body.status !== 'healthy') {
      return fallback('error', `Python service reported status "${String(body.status)}"`);
    }
    return {
      reachable: true,
      status: 'healthy',
      service: typeof body.service === 'string' ? body.service : null,
      version: typeof body.version === 'string' ? body.version : null,
      latencyMs,
      detail: 'Python service is reachable and healthy',
      checkedAt: new Date().toISOString(),
    };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return fallback('timeout', `Python service did not respond within ${timeoutMs} ms`);
    }
    return fallback(
      'unreachable',
      `Python service unreachable: ${err instanceof Error ? err.message : 'unknown error'}`,
    );
  } finally {
    clearTimeout(timer);
  }
}
