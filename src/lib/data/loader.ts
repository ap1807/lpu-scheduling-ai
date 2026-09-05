/**
 * DB <-> Engine bridge: loads the complete schedule state from Prisma
 * into the pure engine format, and persists engine-detected conflicts.
 */
import { db } from '@/lib/db';
import {
  DEFAULT_RULES, mergeRules, detectConflicts, EngineActivity, EngineCourse, EngineFaculty,
  EngineRoom, EngineSchool, EngineStudentGroup, EngineBlock, ScheduleState, SchedulingRuleConfig,
  DetectedConflict, ConflictRecord,
} from '@/lib/engine';

export async function loadScheduleState(): Promise<ScheduleState> {
  const [activities, rooms, faculty, groups, courses, schools, blocks] = await Promise.all([
    db.activity.findMany(),
    db.room.findMany(),
    db.faculty.findMany(),
    db.studentGroup.findMany(),
    db.course.findMany(),
    db.school.findMany(),
    db.academicBlock.findMany(),
  ]);

  const schoolById = new Map(schools.map((s) => [s.id, s]));
  const programById = new Map((await db.program.findMany()).map((p) => [p.id, p]));

  const engineActivities: EngineActivity[] = activities.map((a) => ({
    id: a.id,
    activityCode: a.activityCode,
    courseCode: a.courseCode,
    courseName: a.courseName,
    sectionCode: a.sectionCode,
    programCode: a.programCode,
    schoolCode: a.schoolCode,
    facultyId: a.facultyId,
    facultyName: a.facultyName,
    studentGroupId: a.studentGroupId,
    studentGroupCode: a.studentGroupCode,
    roomId: a.roomId,
    roomCode: a.roomCode,
    blockId: a.blockId,
    blockCode: a.blockCode,
    activityType: a.activityType as EngineActivity['activityType'],
    date: a.date,
    dayOfWeek: a.dayOfWeek,
    startMin: a.startMin,
    endMin: a.endMin,
    capacityRequired: a.capacityRequired,
    notes: a.notes ?? undefined,
    status: a.status as EngineActivity['status'],
  }));

  const engineRooms: EngineRoom[] = rooms.map((r) => ({
    id: r.id,
    code: r.code,
    roomNo: r.roomNo,
    name: r.name,
    blockId: r.blockId,
    blockCode: r.blockId, // block id == code in this dataset
    roomType: r.roomType as EngineRoom['roomType'],
    capacity: r.capacity,
    isExamVenue: r.isExamVenue,
    features: safeParse(r.features, {}),
    unavailable: safeParse(r.unavailable, []),
  }));

  const engineFaculty: EngineFaculty[] = faculty.map((f) => ({
    id: f.id,
    code: f.code,
    name: f.name,
    email: f.email,
    schoolId: f.schoolId,
    schoolCode: f.schoolId, // school id == code in this dataset
    designation: f.designation,
    maxWeeklyHours: f.maxWeeklyHours,
    unavailable: safeParse(f.unavailable, []),
    preferences: safeParse(f.preferences, {}),
  }));

  const engineGroups: EngineStudentGroup[] = groups.map((g) => ({
    id: g.id,
    code: g.code,
    name: g.name,
    programId: g.programId,
    programCode: programById.get(g.programId)?.code ?? g.programId,
    semester: g.semester,
    section: g.section,
    size: g.size,
  }));

  const engineCourses: EngineCourse[] = courses.map((c) => ({
    id: c.id,
    code: c.code,
    name: c.name,
    schoolId: c.schoolId,
    schoolCode: c.schoolId,
    credits: c.credits,
    courseType: c.courseType as EngineCourse['courseType'],
    requiresLab: c.requiresLab,
    examDurationMin: c.examDurationMin,
  }));

  const engineSchools: EngineSchool[] = schools.map((s) => ({
    id: s.id,
    code: s.code,
    name: s.name,
    blockId: s.blockId ?? '',
    blockCode: s.blockId ?? '',
  }));

  const engineBlocks: EngineBlock[] = blocks.map((b) => ({
    id: b.id,
    code: b.code,
    name: b.name,
    campus: b.campus,
  }));

  return {
    activities: engineActivities,
    rooms: engineRooms,
    faculty: engineFaculty,
    studentGroups: engineGroups,
    courses: engineCourses,
    schools: engineSchools,
    blocks: engineBlocks,
  };
  void schoolById;
}

export async function loadRules(): Promise<SchedulingRuleConfig> {
  const rec = await db.schedulingRules.findUnique({ where: { id: 'main' } });
  return mergeRules(rec ? safeParse<Partial<SchedulingRuleConfig>>(rec.config, {}) : null);
}

export { DEFAULT_RULES };

function safeParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

/**
 * Re-run the deterministic conflict detection over the whole schedule and
 * persist the result (upsert by signature-like natural key).
 * Returns the persisted conflict rows.
 */
export async function runAndPersistConflictDetection(): Promise<ConflictRecord[]> {
  const state = await loadScheduleState();
  const rules = await loadRules();
  const detected = detectConflicts(state, rules);

  const existing = await db.conflictRecord.findMany();
  const existingByKey = new Map(existing.map((c) => [buildKey(c), c]));

  const persisted: ConflictRecord[] = [];
  let nextNum = existing.reduce((m, c) => Math.max(m, parseInt(c.code.replace('CFLT-', ''), 10) || 0), 0);
  for (let i = 0; i < detected.length; i++) {
    const d = detected[i];
    const key = buildKey({
      conflictType: d.conflictType,
      signature: d.signature,
      activityIds: JSON.stringify(d.activityIds),
    });
    const prev = existingByKey.get(key);
    const data = {
      conflictType: d.conflictType,
      category: d.category,
      severity: d.severity,
      // re-detected conflict: dismissed stays dismissed (human decision), resolved re-opens
      status: prev?.status === 'DISMISSED' ? 'DISMISSED' : prev?.status === 'RESOLVED' ? 'OPEN' : prev?.status ?? 'OPEN',
      activityIds: JSON.stringify(d.activityIds),
      activitiesSnapshot: JSON.stringify(d.activities.map(snapshotActivity)),
      affectedResources: JSON.stringify(d.affectedResources),
      rootCause: d.rootCause,
      directImpact: d.directImpact,
      cascadingImpact: JSON.stringify(d.cascadingImpact),
      lastAnalyzedAt: new Date(),
    };
    const row = prev
      ? await db.conflictRecord.update({ where: { id: prev.id }, data })
      : await db.conflictRecord.create({
          data: { ...data, code: `CFLT-${String(++nextNum).padStart(4, '0')}`, detectedAt: new Date(), status: 'OPEN' },
        });
    persisted.push(row);
  }

  // Conflicts no longer detected are KEPT as RESOLVED records (audit history:
  // "inspect the complete history of a conflict from detection through final resolution")
  const currentKeys = new Set(detected.map((d) => buildKey({ conflictType: d.conflictType, signature: d.signature, activityIds: JSON.stringify(d.activityIds) })));
  for (const c of existing) {
    if (!currentKeys.has(buildKey(c))) {
      if (c.status === 'DISMISSED' || c.status === 'RESOLVED') continue; // already closed
      await db.conflictRecord.update({
        where: { id: c.id },
        data: {
          status: 'RESOLVED',
          resolvedAt: new Date(),
          resolutionNote: c.resolutionNote ?? 'No longer detected by the engine after a schedule change — automatically closed.',
        },
      });
    }
  }

  return persisted;
}

/** Next conflict code that never collides with existing rows. */
export async function nextConflictCode(): Promise<string> {
  const rows = await db.conflictRecord.findMany({ select: { code: true } });
  const max = rows.reduce((m, r) => Math.max(m, parseInt(r.code.replace('CFLT-', ''), 10) || 0), 0);
  return `CFLT-${String(max + 1).padStart(4, '0')}`;
}

function buildKey(c: { conflictType: string; signature: string; activityIds: string }): string {
  return `${c.conflictType}|${c.signature}|${c.activityIds}`;
}

function snapshotActivity(a: EngineActivity) {
  return {
    id: a.id,
    activityCode: a.activityCode,
    courseCode: a.courseCode,
    courseName: a.courseName,
    sectionCode: a.sectionCode,
    facultyId: a.facultyId,
    facultyName: a.facultyName,
    studentGroupId: a.studentGroupId,
    studentGroupCode: a.studentGroupCode,
    roomId: a.roomId,
    roomCode: a.roomCode,
    blockCode: a.blockCode,
    activityType: a.activityType,
    date: a.date,
    startMin: a.startMin,
    endMin: a.endMin,
    capacityRequired: a.capacityRequired,
  };
}

export function detectedFromRow(row: ConflictRecord, state: ScheduleState): DetectedConflict {
  const ids: string[] = safeParse(row.activityIds, []);
  const activities = state.activities.filter((a) => ids.includes(a.id));
  return {
    conflictType: row.conflictType as DetectedConflict['conflictType'],
    category: row.category as DetectedConflict['category'],
    severity: row.severity as DetectedConflict['severity'],
    activityIds: ids,
    activities,
    affectedResources: safeParse(row.affectedResources, { rooms: [], faculty: [], studentGroups: [], courses: [], blocks: [], dates: [] }),
    rootCause: row.rootCause,
    directImpact: row.directImpact,
    cascadingImpact: safeParse(row.cascadingImpact, []),
    signature: buildKey(row),
  };
}
