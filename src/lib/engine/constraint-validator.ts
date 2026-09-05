/**
 * LPU Scheduling Engine — Constraint Validation (DETERMINISTIC)
 * --------------------------------------------------------------
 * Validates a proposed resolution / schedule modification against the
 * COMPLETE current schedule state and ALL applicable scheduling rules.
 *
 * This module is the single authority on validity:
 *   "An AI model must never be allowed to declare a solution valid
 *    without the scheduling engine independently verifying it."
 */
import { detectConflicts } from './conflict-detector';
import { applyChangesToState } from './state-utils';
import {
  CandidateSolution, ChangeSpec, DetectedConflict, EngineActivity, ScheduleState,
  SchedulingRuleConfig, ValidationReport,
} from './types';
import { durationLabel, minutesToHHMM } from './util';

export interface ValidationResult {
  valid: boolean;
  report: ValidationReport;
  targetResolved: boolean;
  newConflicts: DetectedConflict[];
}

/**
 * Validate a set of changes against the full schedule.
 * - re-runs the complete deterministic conflict detection on the mutated state
 * - confirms the target conflict signature is gone
 * - rejects the change if ANY new hard conflict appears
 * - reports new soft conflicts (does not invalidate, but affects scoring)
 */
export function validateChanges(
  state: ScheduleState,
  rules: SchedulingRuleConfig,
  changes: ChangeSpec[],
  targetConflict?: DetectedConflict | null,
  baselineConflicts?: DetectedConflict[]
): ValidationResult {
  const after = applyChangesToState(state, changes);
  const before = baselineConflicts ?? detectConflicts(state, rules);
  const afterConflicts = detectConflicts(after, rules);

  const beforeSigs = new Set(before.map((c) => c.signature));
  const afterSigs = new Set(afterConflicts.map((c) => c.signature));

  // Conflicts created by the change = present after, absent before
  const created = afterConflicts.filter((c) => !beforeSigs.has(c.signature));
  const resolved = before.filter((c) => !afterSigs.has(c.signature));

  const newHard = created.filter((c) => c.category === 'HARD');
  const newSoft = created.filter((c) => c.category === 'SOFT');

  const targetResolved = !targetConflict ? true : !afterSigs.has(targetConflict.signature);

  const changedIds = new Set(changes.map((c) => c.activityId));
  const changedActs = after.activities.filter((a) => changedIds.has(a.id));

  // Per-change structural checks (room capacity, type, availability, faculty)
  const checks: ValidationReport['checks'] = [];
  const roomById = new Map(after.rooms.map((r) => [r.id, r]));
  const facultyById = new Map(after.faculty.map((f) => [f.id, f]));

  for (const act of changedActs) {
    const room = roomById.get(act.roomId);
    const fac = facultyById.get(act.facultyId);
    checks.push({
      name: `Capacity — ${act.courseCode} ${act.sectionCode} in ${act.roomCode}`,
      passed: !!room && act.capacityRequired <= room.capacity,
      detail: room ? `required ${act.capacityRequired} / capacity ${room.capacity}` : 'room not found',
    });
    if (act.activityType === 'LAB') {
      checks.push({
        name: `Room type — ${act.courseCode} ${act.sectionCode}`,
        passed: !!room && room.roomType === 'LABORATORY',
        detail: `${act.roomCode} is ${room?.roomType ?? 'unknown'}`,
      });
    }
    if (act.activityType === 'EXAM') {
      checks.push({
        name: `Exam venue — ${act.courseCode} ${act.sectionCode}`,
        passed: !!room && (!rules.examVenueStrict || room.isExamVenue),
        detail: `${act.roomCode} exam-venue=${room?.isExamVenue ?? false}`,
      });
    }
    checks.push({
      name: `Time window — ${act.courseCode} ${act.sectionCode}`,
      passed: act.endMin > act.startMin && (act.activityType === 'EVENT' || (act.startMin >= rules.dayStartMin && act.endMin <= rules.dayEndMin)),
      detail: `${act.date} ${durationLabel(act.startMin, act.endMin)} within ${minutesToHHMM(rules.dayStartMin)}–${minutesToHHMM(rules.dayEndMin)}`,
    });
    checks.push({
      name: `Faculty assignment — ${act.courseCode} ${act.sectionCode}`,
      passed: !!fac,
      detail: fac ? `${fac.name} (${fac.schoolCode})` : 'faculty not found',
    });
  }

  checks.push({
    name: 'Target conflict eliminated',
    passed: targetResolved,
    detail: targetConflict ? targetConflict.conflictType : 'no target specified',
  });
  checks.push({
    name: 'No new HARD conflicts introduced',
    passed: newHard.length === 0,
    detail: newHard.length === 0 ? 'engine re-scan clean' : `${newHard.length} new hard conflict(s)`,
  });

  const failed = !targetResolved || newHard.length > 0 || checks.some((c) => !c.passed);

  const report: ValidationReport = {
    engineVerified: true,
    targetConflictResolved: targetResolved,
    newHardConflicts: newHard.map((c) => ({
      type: c.conflictType,
      description: c.rootCause,
      signature: c.signature,
    })),
    newSoftConflicts: newSoft.map((c) => ({
      type: c.conflictType,
      description: c.rootCause,
      signature: c.signature,
    })),
    checks,
    failed,
  };

  return { valid: !failed, report, targetResolved, newConflicts: created };
}

/** Validate a candidate solution (wrapper used by the AI agent pipeline). */
export function validateCandidate(
  state: ScheduleState,
  rules: SchedulingRuleConfig,
  candidate: { changes: ChangeSpec[] },
  targetConflict?: DetectedConflict | null
): { valid: boolean; report: ValidationReport } {
  const res = validateChanges(state, rules, candidate.changes, targetConflict);
  return { valid: res.valid, report: res.report };
}

/** Verify activities referenced in changes exist and are schedulable. */
export function changesReferenceValidActivities(
  state: ScheduleState,
  changes: ChangeSpec[]
): { ok: boolean; missing: string[] } {
  const ids = new Set(state.activities.map((a) => a.id));
  const missing = changes.filter((c) => !ids.has(c.activityId)).map((c) => c.activityId);
  return { ok: missing.length === 0, missing };
}

export type { EngineActivity };
