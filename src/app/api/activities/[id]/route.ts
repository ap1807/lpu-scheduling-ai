import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, requireRole } from '@/lib/session';
import { runAndPersistConflictDetection } from '@/lib/data/loader';
import { dayOfWeek } from '@/lib/engine/util';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    await requireAuth();
    const { id } = await params;
    const activity = await db.activity.findUnique({ where: { id } });
    if (!activity) return Response.json({ error: 'Activity not found' }, { status: 404 });
    return Response.json({ activity });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: 'Failed to load activity' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const user = await requireRole(['ADMIN', 'SCHEDULER']);
    const { id } = await params;
    const body = await req.json();
    const existing = await db.activity.findUnique({ where: { id } });
    if (!existing) return Response.json({ error: 'Activity not found' }, { status: 404 });

    const data: Record<string, unknown> = {};
    if (body.courseCode) data.courseCode = String(body.courseCode).toUpperCase();
    if (body.courseName) data.courseName = String(body.courseName);
    if (body.sectionCode) data.sectionCode = String(body.sectionCode).toUpperCase();
    if (body.activityType) data.activityType = String(body.activityType);
    if (body.date) {
      data.date = String(body.date);
      data.dayOfWeek = dayOfWeek(String(body.date));
    }
    if (body.startMin !== undefined) data.startMin = Number(body.startMin);
    if (body.endMin !== undefined) data.endMin = Number(body.endMin);
    if (body.capacityRequired !== undefined) data.capacityRequired = Number(body.capacityRequired);
    if (body.notes !== undefined) data.notes = body.notes ? String(body.notes) : null;
    if (body.status !== undefined) data.status = String(body.status);

    if (body.roomId) {
      const room = await db.room.findUnique({ where: { id: String(body.roomId) } });
      if (!room) return Response.json({ error: 'Room not found' }, { status: 400 });
      data.roomId = room.id;
      data.roomCode = room.code;
      data.blockId = room.blockId;
      data.blockCode = room.blockId;
    }
    if (body.facultyId) {
      const faculty = await db.faculty.findUnique({ where: { id: String(body.facultyId) } });
      if (!faculty) return Response.json({ error: 'Faculty not found' }, { status: 400 });
      data.facultyId = faculty.id;
      data.facultyName = faculty.name;
    }
    if (body.studentGroupId) {
      const group = await db.studentGroup.findUnique({ where: { id: String(body.studentGroupId) } });
      if (!group) return Response.json({ error: 'Student group not found' }, { status: 400 });
      data.studentGroupId = group.id;
      data.studentGroupCode = group.code;
    }

    const start = Number(data.startMin ?? existing.startMin);
    const end = Number(data.endMin ?? existing.endMin);
    if (end <= start) return Response.json({ error: 'End time must be after start time' }, { status: 400 });

    const updated = await db.activity.update({ where: { id }, data });

    const conflicts = await runAndPersistConflictDetection();
    const touched = conflicts.filter((c) => JSON.parse(c.activityIds).includes(id));

    await db.auditLog.create({
      data: {
        code: `AUD-${String((await db.auditLog.count()) + 1).padStart(4, '0')}`,
        action: 'SCHEDULE_UPDATED',
        actorId: user.id,
        actorName: user.name,
        actorRole: user.role,
        targetType: 'ACTIVITY',
        targetId: id,
        summary: `Updated activity ${existing.activityCode}. Post-update detection: ${conflicts.length} active conflicts, ${touched.length} involving this record.`,
        details: JSON.stringify({ before: existing, after: updated, conflictsInvolving: touched.map((t) => t.code) }),
      },
    });

    return Response.json({ activity: updated, conflictsAfter: conflicts.length, conflictsInvolvingThis: touched.length });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: err instanceof Error ? err.message : 'Update failed' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const user = await requireRole(['ADMIN', 'SCHEDULER']);
    const { id } = await params;
    const existing = await db.activity.findUnique({ where: { id } });
    if (!existing) return Response.json({ error: 'Activity not found' }, { status: 404 });

    await db.activity.delete({ where: { id } });
    const conflicts = await runAndPersistConflictDetection();

    await db.auditLog.create({
      data: {
        code: `AUD-${String((await db.auditLog.count()) + 1).padStart(4, '0')}`,
        action: 'SCHEDULE_DELETED',
        actorId: user.id,
        actorName: user.name,
        actorRole: user.role,
        targetType: 'ACTIVITY',
        targetId: id,
        summary: `Deleted activity ${existing.activityCode} (${existing.courseCode} ${existing.sectionCode}, ${existing.date}). Post-delete detection: ${conflicts.length} active conflicts.`,
        details: JSON.stringify({ before: existing }),
      },
    });

    return Response.json({ deleted: true, conflictsAfter: conflicts.length });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: 'Delete failed' }, { status: 500 });
  }
}
