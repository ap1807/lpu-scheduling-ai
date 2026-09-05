/**
 * LPU Scheduling Engine — Cascading Conflict Detection
 * -----------------------------------------------------
 * When an activity is moved/changed/rescheduled, this module determines
 * whether the modification creates NEW conflicts elsewhere in the timetable
 * and builds a dependency chain:
 *   original conflict → changed activity → affected resource → secondary conflicts
 */
import { detectConflicts } from './conflict-detector';
import { applyChangesToState } from './state-utils';
import { ChangeSpec, DetectedConflict, ScheduleState, SchedulingRuleConfig, SimulationChangeInput, CascadeNode } from './types';

export interface CascadeAnalysis {
  changeSummary: string[];
  newConflicts: DetectedConflict[];
  resolvedConflicts: DetectedConflict[];
  chain: CascadeNode[];
  hasCascadingRisk: boolean;
}

/**
 * Analyze cascade effects of a proposed set of changes.
 * Diff engine-detected conflicts before vs after on a mutated COPY of the state.
 */
export function analyzeCascade(
  state: ScheduleState,
  rules: SchedulingRuleConfig,
  changes: Array<ChangeSpec | SimulationChangeInput>,
  baseline?: DetectedConflict[]
): CascadeAnalysis {
  const before = baseline ?? detectConflicts(state, rules);
  const afterState = applyChangesToState(state, changes);
  const after = detectConflicts(afterState, rules);

  const beforeSigs = new Set(before.map((c) => c.signature));
  const afterSigs = new Set(after.map((c) => c.signature));

  const created = after.filter((c) => !beforeSigs.has(c.signature));
  const resolved = before.filter((c) => !afterSigs.has(c.signature));

  const changeSummary = changes.map((ch) => {
    const act = state.activities.find((a) => a.id === ch.activityId);
    const to = ch.to ?? (ch as SimulationChangeInput).value;
    return `${act ? `${act.courseCode} ${act.sectionCode}` : ch.activityId}: ${ch.field} → ${to}`;
  });

  // Build dependency chain
  const chain: CascadeNode[] = [];

  // Level 0: the change itself
  const changedIds = new Set(changes.map((c) => c.activityId));
  for (const id of changedIds) {
    const act = state.activities.find((a) => a.id === id);
    if (act) {
      chain.push({
        level: 0,
        activityId: act.id,
        activityCode: act.activityCode,
        resource: `${act.courseCode} ${act.sectionCode}`,
        description: `Modified activity: ${changeSummary.filter((s) => s.startsWith(`${act.courseCode} ${act.sectionCode}`)).join('; ')}`,
      });
    }
  }

  // Level 1: direct resources touched by the change
  for (const ch of changes) {
    const act = state.activities.find((a) => a.id === ch.activityId);
    if (!act) continue;
    if (ch.field === 'roomId') {
      chain.push({
        level: 1,
        resource: String(ch.to),
        description: `Destination room occupancy changes — engine re-checks room availability, capacity, type & venue rules`,
      });
    }
    if (ch.field === 'facultyId') {
      chain.push({
        level: 1,
        resource: String(ch.to),
        description: `Replacement faculty workload & availability re-checked`,
      });
    }
    if (ch.field === 'date' || ch.field === 'startMin' || ch.field === 'endMin') {
      chain.push({
        level: 1,
        resource: act.roomCode,
        description: `Room ${act.roomCode} calendar changes — freed slot at original time, new occupancy at target time`,
      });
      chain.push({
        level: 1,
        resource: act.studentGroupCode,
        description: `Student group ${act.studentGroupCode} timetable changes — gap/break/movement rules re-checked`,
      });
    }
  }

  // Level 2+: actual secondary conflicts detected by the engine
  for (const c of created.slice(0, 12)) {
    chain.push({
      level: 2,
      resource: c.affectedResources.rooms[0] ?? c.affectedResources.studentGroups[0] ?? c.affectedResources.faculty[0] ?? '—',
      conflictType: c.conflictType,
      severity: c.severity,
      description: `${c.severity} ${c.conflictType}: ${c.rootCause}`,
      activityCode: c.activities[0]?.activityCode,
      activityId: c.activities[0]?.id,
    });
  }

  return {
    changeSummary,
    newConflicts: created,
    resolvedConflicts: resolved,
    chain,
    hasCascadingRisk: created.some((c) => c.category === 'HARD'),
  };
}
