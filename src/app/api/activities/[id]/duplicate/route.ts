import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/session';
import { runAndPersistConflictDetection } from '@/lib/data/loader';

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const user = await requireRole(['ADMIN', 'SCHEDULER']);
    const { id } = await params;
    const existing = await db.activity.findUnique({ where: { id } });
    if (!existing) return Response.json({ error: 'Activity not found' }, { status: 404 });

    const count = await db.activity.count();
    const { id: _omit, createdAt: _c, updatedAt: _u, ...rest } = existing;
    const copy = await db.activity.create({
      data: {
        ...rest,
        activityCode: `ACT-${String(count + 1).padStart(4, '0')}`,
        notes: existing.notes ? `${existing.notes} (duplicated from ${existing.activityCode})` : `Duplicated from ${existing.activityCode}`,
      },
    });

    const conflicts = await runAndPersistConflictDetection();
    await db.auditLog.create({
      data: {
        code: `AUD-${String((await db.auditLog.count()) + 1).padStart(4, '0')}`,
        action: 'SCHEDULE_CREATED',
        actorId: user.id,
        actorName: user.name,
        actorRole: user.role,
        targetType: 'ACTIVITY',
        targetId: copy.id,
        summary: `Duplicated activity ${existing.activityCode} → ${copy.activityCode}. Post-duplicate detection: ${conflicts.length} active conflicts.`,
        details: JSON.stringify({ source: existing.activityCode, duplicate: copy.activityCode }),
      },
    });

    return Response.json({ activity: copy, conflictsAfter: conflicts.length });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: 'Duplicate failed' }, { status: 500 });
  }
}
