import { db } from '@/lib/db';
import { requireRole } from '@/lib/session';
import { runAndPersistConflictDetection } from '@/lib/data/loader';

export async function POST() {
  try {
    const user = await requireRole(['ADMIN', 'SCHEDULER']);
    const conflicts = await runAndPersistConflictDetection();

    await db.auditLog.create({
      data: {
        code: `AUD-${String((await db.auditLog.count()) + 1).padStart(4, '0')}`,
        action: 'CONFLICT_DETECTION_RERUN',
        actorId: user.id,
        actorName: user.name,
        actorRole: user.role,
        targetType: 'SCHEDULE',
        summary: `Full conflict re-detection completed: ${conflicts.length} active conflicts (${conflicts.filter((c) => c.severity === 'CRITICAL').length} critical).`,
        details: JSON.stringify({
          total: conflicts.length,
          bySeverity: {
            CRITICAL: conflicts.filter((c) => c.severity === 'CRITICAL').length,
            HIGH: conflicts.filter((c) => c.severity === 'HIGH').length,
            MEDIUM: conflicts.filter((c) => c.severity === 'MEDIUM').length,
            LOW: conflicts.filter((c) => c.severity === 'LOW').length,
          },
        }),
      },
    });

    return Response.json({
      total: conflicts.length,
      critical: conflicts.filter((c) => c.severity === 'CRITICAL').length,
      high: conflicts.filter((c) => c.severity === 'HIGH').length,
      medium: conflicts.filter((c) => c.severity === 'MEDIUM').length,
      low: conflicts.filter((c) => c.severity === 'LOW').length,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: err instanceof Error ? err.message : 'Detection failed' }, { status: 500 });
  }
}
