import { requireRole } from '@/lib/session';
import { fetchPythonServiceHealth } from '@/lib/python-service';

/**
 * Health-check bridge for the Python analysis service (python-service/).
 *
 * ADMIN-only diagnostics endpoint, following the same guard pattern as the
 * other settings-tier routes (rules / users / reset). It answers 200 with a
 * structured payload whenever Next.js itself is healthy — Python
 * unavailability is reported inside the body (`reachable: false`), never as
 * an unhandled 5xx, so no existing feature can be affected by the state of
 * the Python service. The internal service URL is never part of the
 * response.
 */
export async function GET() {
  try {
    await requireRole(['ADMIN']);
    const health = await fetchPythonServiceHealth();
    return Response.json(health);
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json(
      { error: err instanceof Error ? err.message : 'Python service check failed' },
      { status: 500 },
    );
  }
}
