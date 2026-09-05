import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, requireRole } from '@/lib/session';
import { runAndPersistConflictDetection } from '@/lib/data/loader';
import { dayOfWeek } from '@/lib/engine/util';

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth();
    const sp = req.nextUrl.searchParams;
    const date = sp.get('date');
    const type = sp.get('type');
    const group = sp.get('group');
    const faculty = sp.get('faculty');
    const room = sp.get('room');
    const search = sp.get('q')?.toLowerCase();
    const sortBy = sp.get('sortBy') ?? 'date';
    const limit = Math.min(500, parseInt(sp.get('limit') ?? '300', 10));

    let where: Record<string, unknown> = {};
    if (date) where.date = date;
    if (type) where.activityType = type;
    if (room) where.roomId = room;
    if (group) where.studentGroupId = group;

    let acts = await db.activity.findMany({ where, orderBy: [{ date: 'asc' }, { startMin: 'asc' }] });
    if (faculty) acts = acts.filter((a) => a.facultyId === faculty);

    // RBAC scoping
    if (user.role === 'FACULTY' && user.linkedFacultyId) {
      const f = await db.faculty.findFirst({ where: { OR: [{ id: user.linkedFacultyId }, { code: user.linkedFacultyId }] } });
      acts = f ? acts.filter((a) => a.facultyId === f.id) : [];
    } else if (user.role === 'STUDENT' && user.linkedGroupId) {
      const g = await db.studentGroup.findFirst({ where: { OR: [{ id: user.linkedGroupId }, { code: user.linkedGroupId }] } });
      acts = g ? acts.filter((a) => a.studentGroupId === g.id) : [];
    }

    if (search) {
      acts = acts.filter((a) =>
        [a.courseCode, a.courseName, a.sectionCode, a.roomCode, a.facultyName, a.studentGroupCode, a.activityCode, a.notes ?? '']
          .join(' ').toLowerCase().includes(search)
      );
    }

    const sorters: Record<string, (a: typeof acts[0], b: typeof acts[0]) => number> = {
      date: (a, b) => (a.date === b.date ? a.startMin - b.startMin : a.date.localeCompare(b.date)),
      course: (a, b) => a.courseCode.localeCompare(b.courseCode),
      room: (a, b) => a.roomCode.localeCompare(b.roomCode),
      faculty: (a, b) => a.facultyName.localeCompare(b.facultyName),
      type: (a, b) => a.activityType.localeCompare(b.activityType),
    };
    acts.sort(sorters[sortBy] ?? sorters.date);

    return Response.json({ activities: acts.slice(0, limit), total: acts.length });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: 'Failed to load activities' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireRole(['ADMIN', 'SCHEDULER']);
    const body = await req.json();

    // ---- validation
    const required = ['courseCode', 'courseName', 'sectionCode', 'facultyId', 'studentGroupId', 'roomId', 'activityType', 'date', 'startMin', 'endMin', 'capacityRequired'];
    for (const f of required) {
      if (body[f] === undefined || body[f] === null || body[f] === '') {
        return Response.json({ error: `Missing required field: ${f}` }, { status: 400 });
      }
    }
    const startMin = Number(body.startMin);
    const endMin = Number(body.endMin);
    if (Number.isNaN(startMin) || Number.isNaN(endMin) || endMin <= startMin) {
      return Response.json({ error: 'End time must be after start time' }, { status: 400 });
    }

    const [room, faculty, group] = await Promise.all([
      db.room.findUnique({ where: { id: String(body.roomId) } }),
      db.faculty.findUnique({ where: { id: String(body.facultyId) } }),
      db.studentGroup.findUnique({ where: { id: String(body.studentGroupId) } }),
    ]);
    if (!room) return Response.json({ error: 'Room not found' }, { status: 400 });
    if (!faculty) return Response.json({ error: 'Faculty not found' }, { status: 400 });
    if (!group) return Response.json({ error: 'Student group not found' }, { status: 400 });

    const course = await db.course.findUnique({ where: { code: String(body.courseCode) } });
    const schoolCode = course?.schoolId ?? faculty.schoolId;
    const program = await db.program.findUnique({ where: { id: group.programId } });

    const count = await db.activity.count();
    const activityCode = `ACT-${String(count + 1).padStart(4, '0')}`;

    const created = await db.activity.create({
      data: {
        activityCode,
        courseCode: String(body.courseCode).toUpperCase(),
        courseName: String(body.courseName),
        sectionCode: String(body.sectionCode).toUpperCase(),
        programCode: program?.code ?? 'GEN',
        schoolCode,
        facultyId: faculty.id,
        facultyName: faculty.name,
        studentGroupId: group.id,
        studentGroupCode: group.code,
        roomId: room.id,
        roomCode: room.code,
        blockId: room.blockId,
        blockCode: room.blockId,
        activityType: String(body.activityType),
        date: String(body.date),
        dayOfWeek: dayOfWeek(String(body.date)),
        startMin,
        endMin,
        capacityRequired: Number(body.capacityRequired) || group.size,
        notes: body.notes ? String(body.notes) : null,
      },
    });

    // re-run detection so conflicts appear immediately
    const conflicts = await runAndPersistConflictDetection();

    await db.auditLog.create({
      data: {
        code: `AUD-${String((await db.auditLog.count()) + 1).padStart(4, '0')}`,
        action: 'SCHEDULE_CREATED',
        actorId: user.id,
        actorName: user.name,
        actorRole: user.role,
        targetType: 'ACTIVITY',
        targetId: created.id,
        summary: `Created activity ${activityCode}: ${created.courseCode} ${created.sectionCode} on ${created.date} ${String(Math.floor(startMin / 60)).padStart(2, '0')}:${String(startMin % 60).padStart(2, '0')} in ${room.code}. Post-create detection: ${conflicts.length} active conflicts.`,
        details: JSON.stringify({ activity: created }),
      },
    });

    return Response.json({ activity: created, conflictsAfter: conflicts.length });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: err instanceof Error ? err.message : 'Create failed' }, { status: 500 });
  }
}
