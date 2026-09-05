/**
 * Agentic AI Resolution Workflow — LPU Scheduling Conflict Resolution
 * --------------------------------------------------------------------
 * Multi-stage agent pipeline:
 *   1  schedule understanding & analysis
 *   2  conflict identification
 *   3  root-cause analysis              (LLM narrative over engine facts)
 *   4  impact & dependency analysis     (engine cascade analyzer)
 *   5  resolution planning
 *   6  candidate solution generation    (deterministic engine search)
 *   7  constraint validation            (engine — sole validity authority)
 *   8  solution scoring & ranking       (engine)
 *   9  recommendation explanation       (LLM over validated facts)
 *  10  human approval (awaiting administrator decision)
 *
 * The AI reasons, explains and narrates; the ENGINE decides what is a
 * conflict and whether a change is valid. The AI can never mark a
 * solution valid, and never touches the official timetable directly.
 */
import { db } from '@/lib/db';
import { llmComplete } from './client';
import { loadScheduleState, loadRules, detectedFromRow } from '@/lib/data/loader';
import {
  analyzeCascade, generateCandidates, scoreAndRank, detectConflicts,
  facultyWeeklyHours, roomUtilization, minutesToHHMM, durationLabel, DAY_NAMES,
} from '@/lib/engine';
import type { CandidateSolution, DetectedConflict, ScheduleState, SchedulingRuleConfig } from '@/lib/engine/types';
import type { SessionUser } from '@/lib/session';

export interface AgentStage {
  stage: number;
  key: string;
  title: string;
  actor: 'AGENT' | 'ENGINE' | 'HUMAN';
  status: 'DONE' | 'AWAITING' | 'FAILED';
  summary: string;
  detail: string;
  at: string;
}

export interface AgentResult {
  requestId: string;
  code: string;
  conflictId: string;
  conflictCode: string;
  status: string;
  stages: AgentStage[];
  narrative: string;
  narrativeSource: 'llm' | 'fallback';
  recommendation: {
    candidateId: string;
    title: string;
    solutionType: string;
    score: number;
    reasoning: string;
    reasoningSource: 'llm' | 'fallback';
    changes: Array<{ field: string; from: string; to: string; activityCode: string }>;
    validation: { valid: boolean; checks: Array<{ name: string; passed: boolean; detail: string }> };
    expectedBenefits: string[];
    sideEffects: string[];
  } | null;
  candidates: Array<{
    id: string;
    rank: number;
    title: string;
    solutionType: string;
    valid: boolean;
    score: number;
    changes: Array<{ field: string; from: string; to: string; activityCode: string }>;
    validation: { valid: boolean; newHardConflicts: number; newSoftConflicts: number; checks: Array<{ name: string; passed: boolean; detail: string }> };
    expectedBenefits: string[];
    sideEffects: string[];
    reasoning: string;
  }>;
}

function nowISO() {
  return new Date().toISOString();
}

function stage(n: number, key: string, title: string, actor: AgentStage['actor'], status: AgentStage['status'], summary: string, detail: string): AgentStage {
  return { stage: n, key, title, actor, status, summary, detail, at: nowISO() };
}

/** Run the full agentic pipeline for a conflict. Persists everything. */
export async function runResolutionAgent(conflictId: string, user: SessionUser): Promise<AgentResult> {
  const conflictRow = await db.conflictRecord.findUnique({ where: { id: conflictId } });
  if (!conflictRow) throw new Error('Conflict not found');

  const state = await loadScheduleState();
  const rules = await loadRules();
  const conflict = detectedFromRow(conflictRow, state);
  const stages: AgentStage[] = [];

  // ---------- Stage 1: schedule understanding ----------
  const stats = scheduleStats(state, rules);
  stages.push(
    stage(1, 'understanding', 'Schedule Understanding & Analysis', 'AGENT', 'DONE',
      `Loaded the complete LPU schedule state: ${stats.activities} activities, ${stats.rooms} rooms, ${stats.faculty} faculty, ${stats.groups} student groups across ${stats.dates} dates.`,
      JSON.stringify(stats, null, 2))
  );

  // ---------- Stage 2: conflict identification (engine) ----------
  const allConflicts = detectConflicts(state, rules);
  const ranked = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 } as Record<string, number>;
  for (const c of allConflicts) ranked[c.severity]++;
  stages.push(
    stage(2, 'identification', 'Conflict Identification (Deterministic Engine)', 'ENGINE', 'DONE',
      `Engine re-scan confirmed ${allConflicts.length} conflicts (critical ${ranked.CRITICAL}, high ${ranked.HIGH}, medium ${ranked.MEDIUM}, low ${ranked.LOW}). Target conflict ${conflictRow.code} (${conflictRow.conflictType}/${conflictRow.severity}) is active.`,
      conflict.rootCause)
  );

  // ---------- Stage 3: root-cause analysis (LLM narrative over engine facts) ----------
  const rootCausePrompt = buildRootCausePrompt(conflict, state, rules);
  const llmRoot = await llmComplete(
    'You are an expert academic scheduling analyst for Lovely Professional University. You are given ONLY verified facts from the deterministic scheduling engine. Write a crisp root-cause analysis (3 short paragraphs max). Never invent data: use only the facts given. End with a line starting with "Root cause:" that names the precise origin of the conflict.',
    rootCausePrompt,
    { retries: 1, maxOutputChars: 2400 }
  );
  const narrative = llmRoot.ok
    ? llmRoot.content
    : fallbackRootCause(conflict, state);
  stages.push(
    stage(3, 'root-cause', 'Root-Cause Analysis', 'AGENT', llmRoot.ok ? 'DONE' : 'DONE',
      llmRoot.ok ? 'LLM narrative generated from engine-verified facts.' : 'LLM unavailable — deterministic root-cause summary used.',
      narrative.slice(0, 1200))
  );

  // ---------- Stage 4: impact & dependency analysis (engine cascade) ----------
  const cascade = analyzeCascade(state, rules, []);
  const affected = summarizeAffected(conflict);
  stages.push(
    stage(4, 'impact', 'Impact & Dependency Analysis (Engine Cascade Analyzer)', 'ENGINE', 'DONE',
      `${affected.summary}. Downstream risk profile: ${cascadeOfConflict(conflict, state)} The engine will re-verify every touched resource (rooms, faculty, student groups) when validating any change.`,
      conflict.cascadingImpact.map((n) => `L${n.level} ${n.resource}: ${n.description}`).join('\n'))
  );

  // ---------- Stage 5: resolution planning ----------
  const strategyList = resolutionStrategiesFor(conflict);
  stages.push(
    stage(5, 'planning', 'Resolution Planning', 'AGENT', 'DONE',
      `Planned search strategies: ${strategyList.join('; ')}. Each strategy will be expanded into concrete candidates by the deterministic generator, then independently validated.`,
      strategyList.join('\n'))
  );

  // ---------- Stage 6: candidate generation (engine) ----------
  const candidates = generateCandidates(state, rules, conflict, { rooms: 7, slots: 4, dates: 3, swaps: 2, faculty: 2 });
  stages.push(
    stage(6, 'candidates', 'Candidate Solution Generation (Deterministic Search)', 'ENGINE', 'DONE',
      `Generated ${candidates.length} candidate solutions from the real schedule state (alternative rooms/labs/exam venues, time slots, dates, swaps, faculty reassignment).`,
      candidates.map((c, i) => `${i + 1}. ${c.title}`).join('\n'))
  );

  // ---------- Stage 7: constraint validation (engine — sole authority) ----------
  const validCount = candidates.filter((c) => c.valid).length;
  stages.push(
    stage(7, 'validation', 'Constraint Validation (Engine — Sole Validity Authority)', 'ENGINE', 'DONE',
      `Full-schedule re-validation: ${validCount}/${candidates.length} candidates passed every constraint (room free, capacity, type, faculty & group availability, no new hard conflicts). ${candidates.length - validCount} were rejected by the engine.`,
      candidates.filter((c) => !c.valid).map((c) => `REJECTED: ${c.title} — ${c.validationReport.newHardConflicts[0]?.description ?? c.validationReport.checks.find((x) => !x.passed)?.name ?? 'failed checks'}`).join('\n') || 'All candidates valid.')
  );

  // ---------- Stage 8: scoring & ranking (engine) ----------
  const rankedCandidates = scoreAndRank(state, candidates, conflict);
  const best = rankedCandidates.find((c) => c.valid) ?? null;
  stages.push(
    stage(8, 'scoring', 'Solution Scoring & Ranking (Engine)', 'ENGINE', 'DONE',
      `Scored 0–100 (validity 40, resolution 20, soft-impact 15, disruption 15, efficiency 10). Top solution: ${best ? `"${best.title}" (score ${best.score})` : 'none'}.`,
      rankedCandidates.map((c) => `#${c.rank} [${c.valid ? 'VALID' : 'INVALID'} ${c.score}] ${c.title}`).join('\n'))
  );

  // ---------- Stage 9: recommendation explanation (LLM) ----------
  let reasoning = '';
  let reasoningSource: 'llm' | 'fallback' = 'fallback';
  if (best) {
    const explainPrompt = buildExplainPrompt(conflict, best, rankedCandidates, state);
    const llmExplain = await llmComplete(
      'You are the recommendation engine of the LPU scheduling platform. Using ONLY the validated data provided, explain in 3 concise paragraphs why the recommended solution is the best choice: (1) what it fixes and how the engine verified it, (2) why it outranks the alternatives, (3) side effects to watch. Cite concrete facts (rooms, capacities, times). Never invent data.',
      explainPrompt,
      { retries: 1, maxOutputChars: 2400 }
    );
    if (llmExplain.ok) {
      reasoning = llmExplain.content;
      reasoningSource = 'llm';
    } else {
      reasoning = fallbackReasoning(best, rankedCandidates);
    }
  }
  stages.push(
    stage(9, 'explanation', 'Recommendation Explanation', 'AGENT', 'DONE',
      best
        ? `Recommended: "${best.title}" — score ${best.score}/100, engine-validated with zero new hard conflicts. ${reasoningSource === 'llm' ? 'LLM explanation grounded in validated facts.' : 'Deterministic explanation (LLM unavailable).'}`
        : 'No valid solution could be generated; conflict requires manual rescheduling.',
      reasoning.slice(0, 1200))
  );

  // ---------- Stage 10: human approval ----------
  stages.push(
    stage(10, 'approval', 'Human Approval (Administrator Review)', 'HUMAN', 'AWAITING',
      'Awaiting administrator decision. The AI cannot apply changes to the official LPU timetable — approve or reject below.',
      'Options: APPROVE (applies the selected candidate, re-runs full conflict detection, verifies resolution, writes audit trail) / REJECT (records the decision).')
  );

  // ---------- persist ----------
  const reqCode = await nextCode('RES');
  const request = await db.resolutionRequest.create({
    data: {
      code: reqCode,
      conflictId: conflictRow.id,
      conflictCode: conflictRow.code,
      status: 'AWAITING_APPROVAL',
      stages: JSON.stringify(stages),
      aiNarrative: narrative,
      requestedBy: user.id,
      requestedByName: user.name,
    },
  });

  const savedCandidates = [];
  for (const c of rankedCandidates) {
    const row = await db.candidateSolution.create({
      data: {
        requestId: request.id,
        solutionType: c.solutionType,
        title: c.title,
        changes: JSON.stringify(c.changes),
        valid: c.valid,
        validationReport: JSON.stringify(c.validationReport),
        score: c.score,
        rank: c.rank,
        reasoning: c.reasoning || (c.rank === 1 && c.valid ? reasoning : ''),
        expectedBenefits: JSON.stringify(c.expectedBenefits),
        sideEffects: JSON.stringify(c.sideEffects),
        status: c.valid ? 'VALIDATED' : 'INVALID',
      },
    });
    savedCandidates.push({ row, c });
  }

  // mark recommended candidate
  let recSummary: AgentResult['recommendation'] = null;
  if (best) {
    const recRow = savedCandidates.find((s) => s.c.rank === 1 && s.c.valid);
    if (recRow) {
      await db.candidateSolution.update({ where: { id: recRow.row.id }, data: { status: 'SELECTED' } });
      recSummary = {
        candidateId: recRow.row.id,
        title: best.title,
        solutionType: best.solutionType,
        score: best.score,
        reasoning,
        reasoningSource,
        changes: best.changes.map(fmtChange),
        validation: { valid: best.valid, checks: best.validationReport.checks },
        expectedBenefits: best.expectedBenefits,
        sideEffects: best.sideEffects,
      };
      await db.resolutionRequest.update({
        where: { id: request.id },
        data: { recommendation: JSON.stringify(recSummary) },
      });
    }
  }

  await db.conflictRecord.update({
    where: { id: conflictRow.id },
    data: { status: conflictRow.status === 'RESOLVED' ? 'RESOLVED' : 'RESOLUTION_PENDING', lastAnalyzedAt: new Date() },
  });

  await db.auditLog.create({
    data: {
      code: await nextCode('AUD'),
      action: 'AI_ANALYSIS_GENERATED',
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role,
      conflictId: conflictRow.id,
      conflictCode: conflictRow.code,
      targetType: 'RESOLUTION_REQUEST',
      targetId: request.id,
      summary: `Agentic AI workflow completed for ${conflictRow.code}: ${candidates.length} candidates, ${validCount} engine-validated, recommendation "${best?.title ?? 'none'}" awaiting approval`,
      details: JSON.stringify({
        stages: stages.map((s) => ({ stage: s.stage, title: s.title, summary: s.summary })),
        candidates: rankedCandidates.map((c) => ({ rank: c.rank, title: c.title, valid: c.valid, score: c.score })),
        narrativeSource: llmRoot.ok ? 'llm' : 'fallback',
        reasoningSource,
      }),
    },
  });

  return {
    requestId: request.id,
    code: request.code,
    conflictId: conflictRow.id,
    conflictCode: conflictRow.code,
    status: request.status,
    stages,
    narrative,
    narrativeSource: llmRoot.ok ? 'llm' : 'fallback',
    recommendation: recSummary,
    candidates: savedCandidates.map(({ row, c }) => ({
      id: row.id,
      rank: c.rank,
      title: c.title,
      solutionType: c.solutionType,
      valid: c.valid,
      score: c.score,
      changes: c.changes.map(fmtChange),
      validation: {
        valid: c.valid,
        newHardConflicts: c.validationReport.newHardConflicts.length,
        newSoftConflicts: c.validationReport.newSoftConflicts.length,
        checks: c.validationReport.checks,
      },
      expectedBenefits: c.expectedBenefits,
      sideEffects: c.sideEffects,
      reasoning: c.reasoning || (c.rank === 1 && c.valid ? reasoning : ''),
    })),
  };
}

// ---------------------------------------------------------------- helpers

function fmtChange(ch: { field: string; from: string | number; to: string | number; activityCode: string; displayLabel: string; displayFrom?: string; displayTo?: string }) {
  return {
    field: ch.displayLabel || ch.field,
    from: ch.displayFrom ?? String(ch.from),
    to: ch.displayTo ?? String(ch.to),
    activityCode: ch.activityCode,
  };
}

async function nextCode(prefix: string): Promise<string> {
  const count =
    prefix === 'RES'
      ? await db.resolutionRequest.count()
      : await db.auditLog.count();
  return `${prefix}-${String(count + 1).padStart(4, '0')}`;
}

function scheduleStats(state: ScheduleState, rules: SchedulingRuleConfig) {
  const dates = new Set(state.activities.map((a) => a.date));
  const classrooms = state.rooms.filter((r) => r.roomType === 'CLASSROOM').length;
  const labs = state.rooms.filter((r) => r.roomType === 'LABORATORY').length;
  const examVenues = state.rooms.filter((r) => r.isExamVenue).length;
  return {
    activities: state.activities.length,
    rooms: state.rooms.length,
    classrooms,
    labs,
    examVenues,
    faculty: state.faculty.length,
    groups: state.studentGroups.length,
    courses: state.courses.length,
    dates: dates.size,
    teachingWindow: `${minutesToHHMM(rules.dayStartMin)}–${minutesToHHMM(rules.dayEndMin)}`,
  };
}

function summarizeAffected(conflict: DetectedConflict): { summary: string } {
  const r = conflict.affectedResources;
  const bits: string[] = [];
  if (r.rooms.length) bits.push(`rooms ${r.rooms.join(', ')}`);
  if (r.faculty.length) bits.push(`faculty ${r.faculty.join(', ')}`);
  if (r.studentGroups.length) bits.push(`student groups ${r.studentGroups.join(', ')}`);
  if (r.courses.length) bits.push(`courses ${r.courses.join(', ')}`);
  return { summary: `Directly affected: ${bits.join('; ')}` };
}

function cascadeOfConflict(conflict: DetectedConflict, state: ScheduleState): string {
  const n = conflict.activities.length;
  const groups = new Set(conflict.activities.map((a) => a.studentGroupCode));
  const totalStudents = state.studentGroups
    .filter((g) => groups.has(g.code))
    .reduce((s, g) => s + g.size, 0);
  return `${n} schedule record(s) involved; ${groups.size} student group(s) ≈ ${totalStudents} students impacted if unresolved.`;
}

function resolutionStrategiesFor(conflict: DetectedConflict): string[] {
  const s: string[] = [];
  switch (conflict.conflictType) {
    case 'ROOM_TIME_OVERLAP':
      s.push('relocate one activity to a free room of sufficient capacity', 'shift one activity to a free time slot', 'move to another date', 'swap rooms between same-time activities');
      break;
    case 'FACULTY_TIME_OVERLAP':
      s.push('reassign a qualified free faculty member', 'shift the time slot', 'reschedule to another day');
      break;
    case 'STUDENT_GROUP_OVERLAP':
    case 'EXAM_GROUP_OVERLAP':
      s.push('move one activity to a free slot/venue', 'reschedule to another date', 'change exam timing');
      break;
    case 'ROOM_CAPACITY_INSUFFICIENT':
      s.push('relocate to a larger venue', 'split or shift time', 'move to another date');
      break;
    case 'ROOM_TYPE_MISMATCH':
      s.push('relocate to an appropriate laboratory', 'shift to a free lab slot', 'reschedule');
      break;
    case 'EXAM_VENUE_INCOMPATIBLE':
      s.push('move the exam to a certified examination hall', 'change exam timing if halls are occupied');
      break;
    case 'FACULTY_UNAVAILABLE':
      s.push('assign an available qualified faculty member', 'reschedule the session', 'shift the time slot');
      break;
    case 'ROOM_UNAVAILABLE':
      s.push('relocate to an available room of the same type', 'shift to a later slot', 'reschedule');
      break;
    case 'DUPLICATE_ACTIVITY':
      s.push('remove the duplicate record');
      break;
    case 'INVALID_TIME':
      s.push('correct the time to a valid teaching slot');
      break;
    default:
      s.push('relocate', 'reschedule', 'rebalance');
  }
  return s;
}

function buildRootCausePrompt(conflict: DetectedConflict, state: ScheduleState, rules: SchedulingRuleConfig): string {
  const acts = conflict.activities.map((a) => ({
    code: a.activityCode,
    course: `${a.courseCode} ${a.courseName}`,
    section: a.sectionCode,
    type: a.activityType,
    date: a.date,
    day: DAY_NAMES[a.dayOfWeek],
    time: durationLabel(a.startMin, a.endMin),
    room: a.roomCode,
    roomLabel: state.rooms.find((r) => r.id === a.roomId)?.name,
    capacity: state.rooms.find((r) => r.id === a.roomId)?.capacity,
    required: a.capacityRequired,
    faculty: a.facultyName,
    group: a.studentGroupCode,
    notes: a.notes,
  }));
  return `CONFLICT ${conflict.conflictType} (severity ${conflict.severity})
Engine root cause (verified): ${conflict.rootCause}
Engine direct impact: ${conflict.directImpact}
Activities involved (verified schedule records):
${JSON.stringify(acts, null, 2)}
Scheduling policy: teaching window ${minutesToHHMM(rules.dayStartMin)}–${minutesToHHMM(rules.dayEndMin)}, Mon–Sat; capacity strict; exams must sit in certified exam venues.
Write the root-cause analysis now.`;
}

function fallbackRootCause(conflict: DetectedConflict, state: ScheduleState): string {
  const first = conflict.activities[0];
  const second = conflict.activities[1];
  const parts = [
    `The scheduling engine has verified a ${conflict.severity} ${conflict.conflictType.replace(/_/g, ' ').toLowerCase()} involving ${conflict.activities.length} timetable record(s).`,
    conflict.rootCause,
    conflict.directImpact,
  ];
  if (first && second) {
    parts.push(
      `Record ${first.activityCode} (${first.courseCode} ${first.sectionCode}, ${DAY_NAMES[first.dayOfWeek]} ${durationLabel(first.startMin, first.endMin)} in ${first.roomCode}) and record ${second.activityCode} (${second.courseCode} ${second.sectionCode}, ${second.activityType}, ${second.roomCode}) are the involved entries.`
    );
  } else if (first) {
    parts.push(`Record ${first.activityCode} (${first.courseCode} ${first.sectionCode}, ${DAY_NAMES[first.dayOfWeek]} ${durationLabel(first.startMin, first.endMin)} in ${first.roomCode}) is the involved entry.`);
  }
  parts.push(`Root cause: ${conflict.rootCause}`);
  return parts.join('\n\n');
}

function buildExplainPrompt(conflict: DetectedConflict, best: CandidateSolution, all: CandidateSolution[], state: ScheduleState): string {
  const top = all.slice(0, 6).map((c) => ({
    rank: c.rank,
    title: c.title,
    valid: c.valid,
    score: c.score,
    newHardConflicts: c.validationReport.newHardConflicts.length,
    newSoftConflicts: c.validationReport.newSoftConflicts.length,
  }));
  const room = state.rooms.find((r) => r.id === best.changes.find((ch) => ch.field === 'roomId')?.to);
  return `CONFLICT: ${conflict.conflictType} — ${conflict.rootCause}
RECOMMENDED SOLUTION (engine-validated, score ${best.score}/100): ${best.title}
Changes: ${best.changes.map((ch) => `${ch.activityCode}: ${ch.displayLabel} ${ch.displayFrom} → ${ch.displayTo}`).join('; ')}
${room ? `Destination room: ${room.name} (${room.code}, ${room.roomType}, capacity ${room.capacity}, block ${room.blockCode})` : ''}
Validation: target conflict eliminated = ${best.validationReport.targetConflictResolved}; new hard conflicts = ${best.validationReport.newHardConflicts.length}; new soft conflicts = ${best.validationReport.newSoftConflicts.length}.
Benefits: ${best.expectedBenefits.join(' | ')}
Side effects: ${best.sideEffects.join(' | ')}
RANKED ALTERNATIVES: ${JSON.stringify(top, null, 2)}
Explain why the recommended solution is the best choice.`;
}

function fallbackReasoning(best: CandidateSolution, all: CandidateSolution[]): string {
  const invalid = all.filter((c) => !c.valid).length;
  return [
    `The recommended solution "${best.title}" was selected because the scheduling engine independently verified it against the complete LPU timetable: it eliminates the original conflict, introduces zero new hard conflicts, and requires only ${best.changes.length} change(s).`,
    `It scored ${best.score}/100 in the deterministic ranking (validity 40, resolution 20, soft-impact 15, disruption 15, efficiency 10), placing it first among ${all.length} candidates — ${invalid} of which were rejected outright by the constraint validator.`,
    `Key side effects to monitor: ${best.sideEffects.join('; ')}.`,
  ].join('\n\n');
}
