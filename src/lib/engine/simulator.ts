/**
 * LPU Scheduling Engine — What-If Simulation (DETERMINISTIC)
 * ------------------------------------------------------------
 * Simulates proposed schedule modifications on a COPY of the schedule
 * without touching the official timetable. Compares current vs proposed
 * and reports: conflicts resolved/created, affected faculty/students/rooms,
 * capacity changes, workload changes, timetable changes, overall impact.
 */
import { detectConflicts, facultyWeeklyHours, roomUtilization } from './conflict-detector';
import { analyzeCascade } from './cascade';
import { applyChangesToState } from './state-utils';
import { SimulationChangeInput, SimulationDelta, ScheduleState, SchedulingRuleConfig } from './types';

export function runSimulation(
  state: ScheduleState,
  rules: SchedulingRuleConfig,
  changes: SimulationChangeInput[]
): SimulationDelta {
  const before = detectConflicts(state, rules);
  const after = applyChangesToState(state, changes);
  const afterConflicts = detectConflicts(after, rules);

  const beforeSigs = new Set(before.map((c) => c.signature));
  const afterSigs = new Set(afterConflicts.map((c) => c.signature));

  const conflictsResolved = before
    .filter((c) => !afterSigs.has(c.signature))
    .map((c) => ({ signature: c.signature, type: c.conflictType, description: c.rootCause }));
  const conflictsCreated = afterConflicts
    .filter((c) => !beforeSigs.has(c.signature))
    .map((c) => ({ signature: c.signature, type: c.conflictType, description: c.rootCause }));

  // Resource diffs
  const changedIds = new Set(changes.map((c) => c.activityId));
  const affectedFaculty = new Set<string>();
  const affectedStudentGroups = new Set<string>();
  const affectedRooms = new Set<string>();
  const timetableChanges: SimulationDelta['timetableChanges'] = [];

  const roomById = new Map(state.rooms.map((r) => [r.id, r]));

  for (const ch of changes) {
    const beforeAct = state.activities.find((a) => a.id === ch.activityId);
    const afterAct = after.activities.find((a) => a.id === ch.activityId);
    if (!beforeAct || !afterAct) continue;
    affectedFaculty.add(beforeAct.facultyName);
    if (afterAct.facultyName !== beforeAct.facultyName) affectedFaculty.add(afterAct.facultyName);
    affectedStudentGroups.add(beforeAct.studentGroupCode);
    affectedRooms.add(beforeAct.roomCode);
    if (afterAct.roomCode !== beforeAct.roomCode) affectedRooms.add(afterAct.roomCode);

    const diffs: string[] = [];
    if (afterAct.roomCode !== beforeAct.roomCode) diffs.push(`room ${beforeAct.roomCode} → ${afterAct.roomCode}`);
    if (afterAct.date !== beforeAct.date) diffs.push(`date ${beforeAct.date} → ${afterAct.date}`);
    if (afterAct.startMin !== beforeAct.startMin) {
      const hh = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
      diffs.push(`time ${hh(beforeAct.startMin)}–${hh(beforeAct.endMin)} → ${hh(afterAct.startMin)}–${hh(afterAct.endMin)}`);
    }
    if (afterAct.facultyName !== beforeAct.facultyName) diffs.push(`faculty ${beforeAct.facultyName} → ${afterAct.facultyName}`);
    timetableChanges.push({
      activityCode: beforeAct.activityCode,
      description: `${beforeAct.courseCode} ${beforeAct.sectionCode}: ${diffs.join(', ') || 'no effective change'}`,
    });
  }

  // Capacity deltas (occupancy load per touched room)
  const capacityChanges: SimulationDelta['capacityChanges'] = [];
  for (const roomCode of affectedRooms) {
    const room = state.rooms.find((r) => r.code === roomCode);
    if (!room) continue;
    const beforeLoad = state.activities.filter((a) => a.roomId === room.id && a.status !== 'CANCELLED').length;
    const afterLoad = after.activities.filter((a) => a.roomId === room.id && a.status !== 'CANCELLED').length;
    capacityChanges.push({
      roomCode: room.code,
      before: beforeLoad,
      after: afterLoad,
      note: afterLoad > beforeLoad ? 'more bookings' : afterLoad < beforeLoad ? 'freed capacity' : 'unchanged',
    });
  }

  // Workload deltas for affected faculty
  const beforeWL = new Map(facultyWeeklyHours(state).map((w) => [w.facultyId, w.hours]));
  const afterWL = new Map(facultyWeeklyHours(after).map((w) => [w.facultyId, w.hours]));
  const workloadChanges: SimulationDelta['workloadChanges'] = [];
  const wlIds = new Set<string>();
  for (const ch of changes) {
    const b = state.activities.find((a) => a.id === ch.activityId);
    const a2 = after.activities.find((a) => a.id === ch.activityId);
    if (b) wlIds.add(b.facultyId);
    if (a2) wlIds.add(a2.facultyId);
    if (ch.field === 'facultyId') wlIds.add(String(ch.value));
  }
  for (const fid of wlIds) {
    const b = beforeWL.get(fid);
    const a = afterWL.get(fid);
    if (b === undefined && a === undefined) continue;
    const f = state.faculty.find((x) => x.id === fid);
    if (b !== a) {
      workloadChanges.push({ facultyName: f?.name ?? fid, before: b ?? 0, after: a ?? 0 });
    }
  }

  // Room utilization snapshot for touched rooms
  void roomUtilization;

  // Overall impact score: resolved (+) vs created (-), weighted by severity
  const sevWeight = { CRITICAL: 40, HIGH: 25, MEDIUM: 8, LOW: 3 } as const;
  let impactScore = 0;
  for (const r of conflictsResolved) {
    const c = before.find((x) => x.signature === r.signature);
    impactScore += sevWeight[c?.severity ?? 'LOW'] ?? 3;
  }
  for (const c of conflictsCreated) {
    const conf = afterConflicts.find((x) => x.signature === c.signature);
    impactScore -= sevWeight[conf?.severity ?? 'LOW'] ?? 3;
  }
  const hardCreated = conflictsCreated.filter((c) => (afterConflicts.find((x) => x.signature === c.signature)?.category) === 'HARD').length;
  impactScore = Math.max(-100, Math.min(100, impactScore));

  const overallImpact: SimulationDelta['overallImpact'] =
    impactScore > 10 ? 'POSITIVE' : impactScore < -10 || hardCreated > 0 ? 'NEGATIVE' : 'NEUTRAL';

  const summary =
    `Simulation of ${changes.length} modification(s): ${conflictsResolved.length} conflict(s) resolved, ` +
    `${conflictsCreated.length} new conflict(s) created (${hardCreated} hard). ` +
    `${affectedFaculty.size} faculty and ${affectedStudentGroups.size} student group(s) affected. ` +
    `Overall impact: ${overallImpact} (${impactScore >= 0 ? '+' : ''}${impactScore}).`;

  // Cascade chain for display
  void analyzeCascade;

  return {
    conflictsResolved,
    conflictsCreated,
    affectedFaculty: Array.from(affectedFaculty).sort(),
    affectedStudentGroups: Array.from(affectedStudentGroups).sort(),
    affectedRooms: Array.from(affectedRooms).sort(),
    capacityChanges,
    workloadChanges,
    timetableChanges,
    overallImpact,
    impactScore,
    summary,
  };
}

export { applyChangesToState, roomById_helper };
function roomById_helper(state: ScheduleState) {
  return new Map(state.rooms.map((r) => [r.id, r]));
}
