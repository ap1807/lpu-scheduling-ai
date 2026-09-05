/**
 * Database seeding — writes the complete LPU sample dataset and runs the
 * first conflict-detection pass so the app is immediately demonstrable.
 */
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth-hash';
import { DEFAULT_RULES } from '@/lib/engine/rules';
import { dayOfWeek } from '@/lib/engine/util';
import { BLOCKS, COURSES, DEMO_USERS, FACULTY, PROGRAMS, ROOMS, SCHOOLS, STUDENT_GROUPS } from './reference-data';
import { generateSchedule } from './activity-generator';
import { runAndPersistConflictDetection } from './loader';

export interface SeedSummary {
  users: number;
  blocks: number;
  schools: number;
  programs: number;
  courses: number;
  faculty: number;
  rooms: number;
  studentGroups: number;
  activities: number;
  conflicts: number;
  window: { start: string; end: string; monday: string };
}

export async function seedDatabase(): Promise<SeedSummary> {
  // ---- wipe (idempotent reseed)
  await db.auditLog.deleteMany();
  await db.candidateSolution.deleteMany();
  await db.resolutionRequest.deleteMany();
  await db.simulationScenario.deleteMany();
  await db.conflictRecord.deleteMany();
  await db.activity.deleteMany();
  await db.room.deleteMany();
  await db.faculty.deleteMany();
  await db.studentGroup.deleteMany();
  await db.course.deleteMany();
  await db.program.deleteMany();
  await db.school.deleteMany();
  await db.academicBlock.deleteMany();
  await db.user.deleteMany();
  await db.schedulingRules.deleteMany();

  // ---- reference data
  await db.academicBlock.createMany({ data: BLOCKS });
  await db.school.createMany({
    data: SCHOOLS.map((s) => ({ id: s.id, code: s.code, name: s.name, blockId: s.blockId })),
  });
  await db.program.createMany({ data: PROGRAMS });
  await db.course.createMany({
    data: COURSES.map((c) => ({
      id: c.id, code: c.code, name: c.name, schoolId: c.schoolId, credits: c.credits,
      courseType: c.courseType, requiresLab: c.requiresLab, examDurationMin: c.examDurationMin,
    })),
  });
  await db.faculty.createMany({
    data: FACULTY.map((f) => ({
      id: f.id, code: f.code, name: f.name, email: f.email, schoolId: f.schoolId,
      designation: f.designation, maxWeeklyHours: f.maxWeeklyHours,
      unavailable: JSON.stringify(f.unavailable), preferences: JSON.stringify(f.preferences),
    })),
  });
  await db.room.createMany({
    data: ROOMS.map((r) => ({
      id: r.id, code: r.code, roomNo: r.roomNo, name: r.name, blockId: r.blockId,
      roomType: r.roomType, capacity: r.capacity, isExamVenue: r.isExamVenue,
      features: JSON.stringify(r.features), unavailable: JSON.stringify(r.unavailable),
    })),
  });
  await db.studentGroup.createMany({ data: STUDENT_GROUPS });

  // ---- users
  await db.user.createMany({
    data: DEMO_USERS.map((u) => ({
      email: u.email, name: u.name, passwordHash: hashPassword(u.password), role: u.role,
      title: u.title, linkedFacultyId: u.linkedFacultyId, linkedGroupId: u.linkedGroupId,
    })),
  });

  // ---- scheduling rules
  await db.schedulingRules.create({
    data: { id: 'main', config: JSON.stringify({ ...DEFAULT_RULES, maxBlockMovesPerDay: 3 }) },
  });

  // ---- activities
  const { activities, window } = generateSchedule();
  const groupById = new Map(STUDENT_GROUPS.map((g) => [g.code, g]));
  const roomById = new Map(ROOMS.map((r) => [r.code, r]));
  const facultyById = new Map(FACULTY.map((f) => [f.code, f]));
  const programById = new Map(PROGRAMS.map((p) => [p.id, p]));
  const schoolByCode = new Map(SCHOOLS.map((s) => [s.code, s]));

  let seq = 0;
  for (const a of activities) {
    seq++;
    const group = groupById.get(a.groupCode);
    const room = roomById.get(a.roomCode);
    const faculty = facultyById.get(a.facultyCode);
    const program = programById.get(group?.programId ?? '');
    const school = schoolByCode.get(program?.schoolId ?? '');
    await db.activity.create({
      data: {
        activityCode: `ACT-${String(seq).padStart(4, '0')}`,
        courseCode: a.courseCode,
        courseName: a.courseName,
        sectionCode: a.sectionCode,
        programCode: program?.code ?? 'GEN',
        schoolCode: school?.code ?? 'SCSE',
        facultyId: faculty?.id ?? a.facultyCode,
        facultyName: faculty?.name ?? a.facultyCode,
        studentGroupId: group?.id ?? a.groupCode,
        studentGroupCode: a.groupCode,
        roomId: room?.id ?? a.roomCode,
        roomCode: a.roomCode,
        blockId: room?.blockId ?? '',
        blockCode: room?.blockId ?? '',
        activityType: a.activityType,
        date: a.date,
        dayOfWeek: dayOfWeek(a.date),
        startMin: a.startMin,
        endMin: a.endMin,
        capacityRequired: a.capacityRequired,
        notes: a.notes ?? null,
        isDemoConflict: a.isDemoConflict,
      },
    });
  }

  // ---- first conflict detection pass
  const conflicts = await runAndPersistConflictDetection();

  // ---- audit log entry
  await db.auditLog.create({
    data: {
      code: 'AUD-0001',
      action: 'SEED',
      actorId: 'system',
      actorName: 'System (Seeder)',
      actorRole: 'ADMIN',
      targetType: 'DATABASE',
      summary: `Seeded LPU sample dataset: ${activities.length} activities, ${conflicts.length} conflicts detected by the scheduling engine`,
      details: JSON.stringify({ activities: activities.length, conflicts: conflicts.length, window, conflictTypes: conflicts.map((c) => c.conflictType) }),
    },
  });

  return {
    users: DEMO_USERS.length,
    blocks: BLOCKS.length,
    schools: SCHOOLS.length,
    programs: PROGRAMS.length,
    courses: COURSES.length,
    faculty: FACULTY.length,
    rooms: ROOMS.length,
    studentGroups: STUDENT_GROUPS.length,
    activities: activities.length,
    conflicts: conflicts.length,
    window,
  };
}

/** Seed only when empty (bootstrap on first run). */
export async function ensureSeeded(): Promise<boolean> {
  const count = await db.activity.count();
  if (count > 0) return false;
  await seedDatabase();
  return true;
}
