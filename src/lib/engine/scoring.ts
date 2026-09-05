/**
 * LPU Scheduling Engine — Solution Scoring & Ranking (DETERMINISTIC)
 * --------------------------------------------------------------------
 * Scores validated candidate solutions 0–100 and ranks them.
 * Higher score = better. Only engine-validated candidates get full scores;
 * invalid candidates are pushed to the bottom with the reason attached.
 */
import { CandidateSolution, DetectedConflict, ScheduleState } from './types';

export interface ScoreBreakdown {
  validity: number;       // 0 or 40 — engine verified, no new hard conflicts
  resolution: number;     // 0-20  — target conflict(s) actually eliminated
  softPenalty: number;    // 0-15  — new soft conflicts introduced
  disruption: number;     // 0-15  — students/faculty affected by the change
  efficiency: number;     // 0-10  — room fit, same block, minimal time drift
  total: number;
}

export function scoreCandidate(
  state: ScheduleState,
  candidate: CandidateSolution,
  conflict?: DetectedConflict | null
): { score: number; breakdown: ScoreBreakdown } {
  const b: ScoreBreakdown = { validity: 0, resolution: 0, softPenalty: 0, disruption: 0, efficiency: 0, total: 0 };

  // 1. Engine validity gate
  if (!candidate.valid) {
    b.total = 0;
    return { score: 0, breakdown: b };
  }
  b.validity = 40;

  // 2. Target resolution
  b.resolution = candidate.validationReport.targetConflictResolved ? 20 : 0;

  // 3. Soft conflicts introduced
  const softCount = candidate.validationReport.newSoftConflicts.length;
  b.softPenalty = Math.max(0, 15 - softCount * 5);

  // 4. Disruption weight — how many people/resources must adjust
  let affectedStudents = 0;
  let affectedFaculty = 0;
  const timeChanged = candidate.changes.some((c) => c.field === 'startMin' || c.field === 'endMin' || c.field === 'date');
  for (const ch of candidate.changes) {
    const act = state.activities.find((a) => a.id === ch.activityId);
    if (!act) continue;
    const group = state.studentGroups.find((g) => g.id === act.studentGroupId);
    affectedStudents += group?.size ?? act.capacityRequired;
    affectedFaculty += 1;
  }
  // Swaps affect two sections
  const swapMultiplier = candidate.solutionType === 'SWAP_ROOMS' || candidate.solutionType === 'SWAP_FACULTY' ? 1.6 : 1;
  const disruptionLoad = (affectedStudents / 100) * swapMultiplier * (timeChanged ? 1.5 : 1) + affectedFaculty * 0.5;
  b.disruption = Math.max(0, Math.round((15 - Math.min(12, disruptionLoad)) * 10) / 10);

  // 5. Efficiency — capacity fit + same block + minimal drift
  let efficiency = 10;
  const roomChange = candidate.changes.find((c) => c.field === 'roomId');
  if (roomChange) {
    const act = state.activities.find((a) => a.id === roomChange.activityId);
    const newRoom = state.rooms.find((r) => r.id === roomChange.to);
    if (act && newRoom) {
      const fillPct = act.capacityRequired > 0 ? (act.capacityRequired / newRoom.capacity) * 100 : 0;
      if (fillPct < 50) efficiency -= 3;               // wasting a big room
      else if (fillPct > 100) efficiency -= 10;         // shouldn't happen post-validation
      if (newRoom.blockId !== act.blockId) efficiency -= 2; // cross-block move
    }
  }
  const timeChange = candidate.changes.find((c) => c.field === 'startMin');
  if (timeChange && act_of(state, timeChange.activityId)) {
    const act = act_of(state, timeChange.activityId);
    const drift = Math.abs(Number(timeChange.to) - act.startMin);
    efficiency -= Math.min(4, drift / 60); // 1 point per hour of drift
  }
  if (candidate.changes.length > 2) efficiency -= 2; // complex changes riskier
  b.efficiency = Math.max(0, Math.round(efficiency * 10) / 10);

  b.total = Math.round((b.validity + b.resolution + b.softPenalty + b.disruption + b.efficiency) * 10) / 10;
  void conflict;
  return { score: b.total, breakdown: b };
}

function act_of(state: ScheduleState, id: string) {
  return state.activities.find((a) => a.id === id);
}

/**
 * Score and rank a list of candidates. Returns a new sorted array
 * (rank 1 = best). Deterministic tie-break: fewer changes, then title.
 */
export function scoreAndRank(
  state: ScheduleState,
  candidates: CandidateSolution[],
  conflict?: DetectedConflict | null
): CandidateSolution[] {
  const scored = candidates.map((c) => {
    const { score } = scoreCandidate(state, c, conflict);
    return { ...c, score };
  });
  scored.sort((a, b) => {
    if (a.valid !== b.valid) return a.valid ? -1 : 1;
    if (b.score !== a.score) return b.score - a.score;
    if (a.changes.length !== b.changes.length) return a.changes.length - b.changes.length;
    return a.title.localeCompare(b.title);
  });
  return scored.map((c, i) => ({ ...c, rank: i + 1 }));
}
