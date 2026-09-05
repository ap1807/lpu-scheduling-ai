import { NextRequest } from 'next/server';
import { requireRole } from '@/lib/session';
import { runResolutionAgent } from '@/lib/ai/agent';

export async function POST(req: NextRequest) {
  try {
    const user = await requireRole(['ADMIN', 'SCHEDULER']);
    const body = await req.json();
    if (!body.conflictId) return Response.json({ error: 'conflictId is required' }, { status: 400 });

    const result = await runResolutionAgent(String(body.conflictId), user);
    return Response.json(result);
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: err instanceof Error ? err.message : 'Resolution analysis failed' }, { status: 500 });
  }
}
