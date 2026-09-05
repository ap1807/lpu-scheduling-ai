/**
 * Quick engine validation — runs generator + detector + candidate pipeline
 * in-memory (no DB) to verify the deliberate conflict landscape.
 */
import { generateSchedule } from '../src/lib/data/activity-generator';
import { COURSES, FACULTY, PROGRAMS, ROOMS, SCHOOLS, STUDENT_GROUPS, BLOCKS } from '../src/lib/data/reference-data';
import { detectConflicts, DEFAULT_RULES } from '../src/lib/engine';
import { generateCandidates } from '../src/lib/engine/candidate-generator';
import { scoreAndRank } from '../src/lib/engine/scoring';
import { runSimulation } from '../src/lib/engine/simulator';
import type { ScheduleState, EngineActivity } from '../src/lib/engine/types';

const { activities, window } = generateSchedule();

const state: ScheduleState = {
  activities: activities.map((a, i) => ({
    id: `A${i}`,
    activityCode: `ACT-${String(i + 1).padStart(4, '0')}`,
    courseCode: a.courseCode,
    courseName: a.courseName,
    sectionCode: a.sectionCode,
    programCode: 'GEN',
    schoolCode: 'SCSE',
    facultyId: a.facultyCode,
    facultyName: FACULTY.find((f) => f.code === a.facultyCode)?.name ?? a.facultyCode,
    studentGroupId: a.groupCode,
    studentGroupCode: a.groupCode,
    roomId: a.roomCode,
    roomCode: a.roomCode,
    blockId: a.roomCode.split('-')[0],
    blockCode: a.roomCode.split('-')[0],
    activityType: a.activityType,
    date: a.date,
    dayOfWeek: new Date(a.date + 'T00:00:00Z').getUTCDay(),
    startMin: a.startMin,
    endMin: a.endMin,
    capacityRequired: a.capacityRequired,
    status: 'SCHEDULED',
  })),
  rooms: ROOMS.map((r) => ({ ...r, blockCode: r.blockId })),
  faculty: FACULTY.map((f) => ({ ...f, schoolCode: f.schoolId })),
  studentGroups: STUDENT_GROUPS.map((g) => ({ ...g, programCode: g.programId })),
  courses: COURSES.map((c) => ({ ...c, schoolCode: c.schoolId })),
  schools: SCHOOLS.map((s) => ({ ...s })),
  blocks: BLOCKS,
};

const rules = { ...DEFAULT_RULES, maxBlockMovesPerDay: 3 };

console.log(`Window: ${window.start} .. ${window.end}`);
console.log(`Activities generated: ${activities.length}`);

const conflicts = detectConflicts(state, rules);
console.log(`\nConflicts detected: ${conflicts.length}`);
const counts: Record<string, number> = {};
for (const c of conflicts) counts[`${c.severity}/${c.conflictType}`] = (counts[`${c.severity}/${c.conflictType}`] ?? 0) + 1;
for (const [k, v] of Object.entries(counts).sort()) console.log(`  ${k}: ${v}`);

// ---- golden demo check: room overlap B24-105 between CSE301-A and CSE302-B
const golden = conflicts.find(
  (c) => c.conflictType === 'ROOM_TIME_OVERLAP' && c.affectedResources.rooms.includes('B24-105') && c.affectedResources.courses.includes('CSE301')
);
if (golden) {
  console.log('\n=== GOLDEN DEMO CONFLICT FOUND ===');
  console.log(golden.rootCause);
  console.log('Activities:', golden.activities.map((a: EngineActivity) => `${a.courseCode} ${a.sectionCode} ${a.date} ${a.startMin}-${a.endMin} @ ${a.roomCode}`).join(' || '));

  // ---- candidate generation for the golden conflict
  const candidates = generateCandidates(state, rules, golden);
  const ranked = scoreAndRank(state, candidates, golden);
  console.log(`\nCandidates generated: ${ranked.length} (valid: ${ranked.filter((c) => c.valid).length})`);
  for (const c of ranked.slice(0, 6)) {
    console.log(`  #${c.rank} [${c.valid ? 'VALID' : 'INVALID'} score=${c.score}] ${c.title}`);
    if (!c.valid) console.log(`     -> ${c.validationReport.newHardConflicts[0]?.description ?? c.validationReport.checks.find((x) => !x.passed)?.detail ?? 'failed'}`);
  }
} else {
  console.log('\n!!! GOLDEN DEMO CONFLICT NOT FOUND');
}

// ---- what-if simulation: move the CSE301-A activity to another room at same time
const act = state.activities.find((a) => a.courseCode === 'CSE301' && a.sectionCode === 'CSE301-A' && a.roomCode === 'B24-105');
if (act) {
  const target = ROOMS.find((r) => r.code === 'B24-201');
  if (target) {
    const sim = runSimulation(state, rules, [{ activityId: act.id, field: 'roomId', value: 'B24-201' }]);
    console.log('\n=== WHAT-IF: move CSE301-A (golden) to B24-201 ===');
    console.log('Summary:', sim.summary);
    console.log('Resolved:', sim.conflictsResolved.map((r) => r.type));
    console.log('Created:', sim.conflictsCreated.map((r) => r.type));
    console.log('Impact:', sim.overallImpact, sim.impactScore);
  }
}

// workload snapshot
const wl = detectConflicts(state, rules).filter((c) => c.conflictType === 'FACULTY_OVERLOAD');
console.log(`\nFaculty overload conflicts: ${wl.length} (${wl.map((w) => w.activities[0]?.facultyName).join(', ')})`);

console.log('\n=== CRITICAL CONFLICT DETAILS ===');
for (const c of conflicts.filter((x) => x.severity === 'CRITICAL')) {
  console.log(`\n[${c.conflictType}] ${c.rootCause.slice(0, 160)}`);
  console.log(`  activities: ${c.activities.map((a: EngineActivity) => `${a.courseCode}/${a.sectionCode}/${a.activityType} ${a.date} ${a.startMin}-${a.endMin} ${a.roomCode} ${a.facultyName}`).join(' || ')}`);
}
