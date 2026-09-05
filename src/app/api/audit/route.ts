import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/session';

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth();
    const sp = req.nextUrl.searchParams;
    const action = sp.get('action');
    const conflictCode = sp.get('conflict');
    const limit = Math.min(200, parseInt(sp.get('limit') ?? '80', 10));

    let where: Record<string, unknown> = {};
    if (action) where.action = action;
    if (conflictCode) where.conflictCode = conflictCode;
    if (user.role !== 'ADMIN') {
      // non-admins see the shared trail (records are anonymized-safe), scope to non-user-management
    }

    const logs = await db.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit });

    return Response.json({
      logs: logs.map((l) => ({
        id: l.id,
        code: l.code,
        action: l.action,
        actorName: l.actorName,
        actorRole: l.actorRole,
        conflictCode: l.conflictCode,
        targetType: l.targetType,
        targetId: l.targetId,
        summary: l.summary,
        createdAt: l.createdAt,
        details: l.details,
      })),
      total: logs.length,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: 'Failed to load audit trail' }, { status: 500 });
  }
}
