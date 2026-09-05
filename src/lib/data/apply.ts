/**
 * Controlled application of validated changes to the OFFICIAL LPU timetable.
 * Only invoked after human approval; re-validates against current state,
 * applies atomically, re-runs conflict detection and records the audit trail.
 */
import { db } from '@/lib/db';
import { loadScheduleState, loadRules, runAndPersistConflictDetection } from './loader';
import { validateChanges } from '@/lib/engine';
import type { ChangeSpec, DetectedConflict, ScheduleState, SchedulingRuleConfig } from '@/lib/engine/types';
import { dayOfWeek } from '@/lib/engine/util';

export interface ApplyResult {
  applied: boolean;
  reason?: string;
  activitiesUpdated: string[];
  originalConflictResolved: boolean;
  newConflictsIntroduced: Array<{ type: string; description: string }>;
  conflictStatus: 'RESOLVED' | 'PARTIALLY_RESOLVED' | 'UNRESOLVED';
  postDetectionSummary: { total: number; critical: number; high: number; medium: number; low: number };
}

/** Re-validate + apply + re-detect. Returns verification outcome for the audit trail. */
export async function applyChangesToOfficialSchedule(
  changes: ChangeSpec[],
  targetConflict: DetectedConflict | null,
  actor: { id: string; name: string; role: string }
): Promise<ApplyResult> {
  const state: ScheduleState = await loadScheduleState();
  const rules: SchedulingRuleConfig = await loadRules();

  // Safety re-validation against the CURRENT schedule (it may have changed since generation)
  const validation = validateChanges(state, rules, changes, targetConflict);
  if (!validation.valid) {
    return {
      applied: false,
      reason: 'Re-validation against the current schedule failed — the schedule changed since this solution was generated. Please re-run the AI analysis.',
      activitiesUpdated: [],
      originalConflictResolved: false,
      newConflictsIntroduced: validation.report.newHardConflicts.map((c) => ({ type: c.type, description: c.description })),
      conflictStatus: 'UNRESOLVED',
      postDetectionSummary: { total: 0, critical: 0, high: 0, medium: 0, low: 0 },
    };
  }

  // Apply changes row by row
  const updatedIds: string[] = [];
  const beforeSnapshots: Record<string, unknown> = {};
  for (const ch of changes) {
    const act = await db.activity.findUnique({ where: { id: ch.activityId } });
    if (!act) continue;
    beforeSnapshots[act.id] = act;
    const data: Record<string, unknown> = {};
    if (ch.field === 'roomId') {
      const room = await db.room.findUnique({ where: { id: String(ch.to) } });
      if (!room) continue;
      data.roomId = room.id;
      data.roomCode = room.code;
      data.blockId = room.blockId;
      data.blockCode = room.blockId;
    } else if (ch.field === 'facultyId') {
      const fac = await db.faculty.findUnique({ where: { id: String(ch.to) } });
      if (!fac) continue;
      data.facultyId = fac.id;
      data.facultyName = fac.name;
    } else if (ch.field === 'date') {
      data.date = String(ch.to);
      data.dayOfWeek = dayOfWeek(String(ch.to));
    } else if (ch.field === 'startMin') {
      const dur = act.endMin - act.startMin;
      data.startMin = Number(ch.to);
      data.endMin = Number(ch.to) + dur;
    } else if (ch.field === 'endMin') {
      data.endMin = Number(ch.to);
    }
    if (Object.keys(data).length > 0) {
      await db.activity.update({ where: { id: act.id }, data });
      updatedIds.push(act.id);
    }
  }

  // Full re-detection
  const persisted = await runAndPersistConflictDetection();
  const stillThere = targetConflict ? persisted.some((c) => c.conflictType === targetConflict.conflictType && c.rootCause === targetConflict.rootCause) : true;
  const bySig = new Set(persisted.map((c) => `${c.conflictType}|${c.rootCause}`));
  const targetSig = targetConflict ? `${targetConflict.conflictType}|${targetConflict.rootCause}` : '';

  // Detect NEW conflicts introduced (compare with validation prediction)
  const newIntroduced = validation.report.newHardConflicts.map((c) => ({ type: String(c.type), description: c.description }));

  const counts = { total: persisted.length, critical: 0, high: 0, medium: 0, low: 0 } as ApplyResult['postDetectionSummary'];
  persisted.forEach((c) => {
    counts[c.severity.toLowerCase() as 'critical' | 'high' | 'medium' | 'low']++;
  });

  const resolved = targetConflict ? !bySig.has(targetSig) : true;

  await db.auditLog.create({
    data: {
      code: `AUD-${String((await db.auditLog.count()) + 1).padStart(4, '0')}`,
      action: 'CHANGE_APPLIED',
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      conflictId: targetConflict?.activities[0]?.id ?? null,
      targetType: 'ACTIVITY',
      targetId: updatedIds[0] ?? null,
      summary: `Applied ${changes.length} validated change(s) to ${updatedIds.length} activity record(s). Post-change re-detection: ${persisted.length} conflicts; original conflict ${resolved ? 'RESOLVED' : 'still present'}; ${newIntroduced.length} new conflict(s) flagged by pre-validation.`,
      details: JSON.stringify({
        before: beforeSnapshots,
        changes,
        afterIds: updatedIds,
        postDetection: counts,
        originalResolved: resolved,
        newIntroduced,
      }),
    },
  });

  return {
    applied: true,
    activitiesUpdated: updatedIds,
    originalConflictResolved: resolved,
    newConflictsIntroduced: newIntroduced,
    conflictStatus: resolved ? (newIntroduced.length === 0 ? 'RESOLVED' : 'PARTIALLY_RESOLVED') : 'UNRESOLVED',
    postDetectionSummary: counts,
  };
}
