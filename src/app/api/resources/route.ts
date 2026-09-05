import { db } from '@/lib/db';
import { requireAuth } from '@/lib/session';

export async function GET() {
  try {
    await requireAuth();
    const [blocks, schools, programs, courses, faculty, rooms, groups] = await Promise.all([
      db.academicBlock.findMany(),
      db.school.findMany(),
      db.program.findMany(),
      db.course.findMany(),
      db.faculty.findMany(),
      db.room.findMany(),
      db.studentGroup.findMany(),
    ]);
    return Response.json({
      blocks,
      schools,
      programs,
      courses: courses.map((c) => ({ ...c, faculty: [] })),
      faculty: faculty.map((f) => ({
        id: f.id, code: f.code, name: f.name, schoolId: f.schoolId, designation: f.designation,
        maxWeeklyHours: f.maxWeeklyHours, email: f.email,
      })),
      rooms: rooms.map((r) => ({
        id: r.id, code: r.code, roomNo: r.roomNo, name: r.name, blockId: r.blockId,
        roomType: r.roomType, capacity: r.capacity, isExamVenue: r.isExamVenue,
      })),
      studentGroups: groups,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: 'Failed to load resources' }, { status: 500 });
  }
}
