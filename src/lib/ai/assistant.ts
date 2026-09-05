/**
 * LPU AI Scheduling Assistant — natural-language interface.
 * -----------------------------------------------------------
 * The assistant NEVER fabricates data. A deterministic intent router
 * extracts the question's meaning, retrieves REAL records from the
 * database/engine, and only then hands those facts to the LLM to compose
 * the final grounded answer. If the LLM is unavailable, a deterministic
 * formatted answer is returned instead. Traceable references
 * (conflict codes, activity codes) are always attached.
 */
import { db } from '@/lib/db';
import { llmComplete } from './client';
import { loadScheduleState, loadRules } from '@/lib/data/loader';
import { detectConflicts, facultyWeeklyHours, minutesToHHMM, DAY_SHORT, dateLabel, dayOfWeek, addDays } from '@/lib/engine';
import type { DetectedConflict, ScheduleState, SchedulingRuleConfig, EngineActivity } from '@/lib/engine/types';
import type { SessionUser } from '@/lib/session';

export interface AssistantReference {
  kind: 'conflict' | 'activity' | 'room' | 'faculty' | 'studentGroup' | 'course';
  code: string;
  label: string;
}

export interface AssistantReply {
  answer: string;
  source: 'llm' | 'fallback';
  intent: string;
  references: AssistantReference[];
  facts: string[];
  suggestions: string[];
  followUpActions: Array<{ label: string; view: string; params?: Record<string, string> }>;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const INTENTS = {
  ROOM_CONFLICTS_DATE: 'room-conflicts-by-date',
  COURSE_CONFLICT: 'conflict-by-course',
  GROUP_CONFLICTS: 'conflicts-by-student-group',
  BEST_SOLUTION: 'best-solution',
  WHAT_IF: 'what-if-move',
  EXAM_CONFLICTS: 'exam-conflicts',
  UNDERUTILIZED_ROOMS: 'underutilized-rooms',
  FACULTY_WORKLOAD: 'faculty-workload',
  CRITICAL_BY_BLOCK: 'critical-by-block',
  CONFLICT_OVERVIEW: 'conflict-overview',
  SCHEDULE_LOOKUP: 'schedule-lookup',
  FALLBACK: 'general',
} as const;

function extractCourseCode(q: string): string | null {
  const m = q.toUpperCase().match(/\b([A-Z]{2,4}\s?\d{3})\b/);
  return m ? m[1].replace(/\s/g, '') : null;
}
function extractConflictCode(q: string): string | null {
  const m = q.toUpperCase().match(/CFLT-?(\d{1,4})/);
  return m ? `CFLT-${m[1].padStart(4, '0')}` : null;
}
function extractActivityCode(q: string): string | null {
  const m = q.toUpperCase().match(/ACT-?(\d{1,4})/);
  return m ? `ACT-${m[1].padStart(4, '0')}` : null;
}
function extractGroupToken(q: string): string | null {
  const m = q.toUpperCase().match(/\b([A-Z]{3})\d{2}-[A-Z]{1,2}\b/);
  if (m) return m[1] + m[0].slice(3);
  const m2 = q.toUpperCase().match(/\b(CSE|ECE|ME|MBA|HM|BIO)\s*(STUDENTS?|GROUP|SECTION|BATCH)\b/);
  if (m2) return m2[1];
  const m3 = q.toUpperCase().match(/\b(CSE|ECE|ME|MBA|HM|BIO)\b/);
  return m3 ? m3[1] : null;
}
function extractBlockCode(q: string): string | null {
  const m = q.toUpperCase().match(/\bB(LOCK\s?)?(\d{2})\b/);
  return m ? `B${m[2]}` : null;
}
function extractRoomCode(q: string): string | null {
  const m = q.toUpperCase().match(/\bB\d{2}-(?:L?\d{1,3}|SDA|TR|T1)\b/);
  return m ? m[0] : null;
}
function resolveDate(q: string): { date: string | null; label: string } {
  const today = new Date().toISOString().slice(0, 10);
  const lower = q.toLowerCase();
  if (lower.includes('tomorrow')) return { date: addDays(today, 1), label: 'tomorrow' };
  if (lower.includes('today')) return { date: today, label: 'today' };
  const dm = lower.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (dm) return { date: dm[1], label: dm[1] };
  const dm2 = lower.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
  if (dm2) {
    const target = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(dm2[1]);
    const todayDow = dayOfWeek(today);
    let diff = (target - todayDow + 7) % 7;
    if (diff === 0) diff = 7;
    return { date: addDays(today, diff), label: dm2[1] };
  }
  return { date: null, label: 'the current window' };
}

export async function answerAssistantQuestion(
  question: string,
  history: ChatMessage[],
  user: SessionUser
): Promise<AssistantReply> {
  const q = question.trim();
  const state = await loadScheduleState();
  const rules = await loadRules();
  const allConflicts = detectConflicts(state, rules);

  // scope for faculty / student roles
  const scopedConflicts = scopeConflicts(allConflicts, user, state);

  const intent = classify(q, scopedConflicts.length);
  const refs: AssistantReference[] = [];
  const facts: string[] = [];
  const suggestions: string[] = [];
  const followUpActions: Array<{ label: string; view: string; params?: Record<string, string> }> = [];
  let contextSummary = '';

  switch (intent) {
    case INTENTS.ROOM_CONFLICTS_DATE: {
      const { date, label } = resolveDate(q);
      const roomConflicts = scopedConflicts.filter(
        (c) => c.conflictType === 'ROOM_TIME_OVERLAP' && (!date || c.affectedResources.dates.includes(date))
      );
      contextSummary = `Room overlap conflicts ${date ? `on ${date} (${label})` : 'in the current window'}: ${roomConflicts.length}.`;
      facts.push(...roomConflicts.map((c) => `${c.conflictType}: ${c.rootCause}`));
      roomConflicts.forEach((c) => refs.push({ kind: 'conflict', code: sig(c), label: `${c.conflictType} ${c.affectedResources.rooms.join('/')}` }));
      suggestions.push('Ask: "What is the best solution for this conflict?"', 'Ask: "What happens if I move the class to another room?"');
      if (roomConflicts[0]) followUpActions.push({ label: 'Open conflict in Conflict Center', view: 'conflicts', params: { conflict: roomConflicts[0].signature } });
      break;
    }
    case INTENTS.COURSE_CONFLICT: {
      const code = extractCourseCode(q);
      const matches = code ? scopedConflicts.filter((c) => c.affectedResources.courses.includes(code)) : scopedConflicts.slice(0, 5);
      contextSummary = `Conflicts involving course ${code ?? '(top conflicts)'}: ${matches.length}.`;
      facts.push(...matches.map((c) => `[${c.severity}] ${c.conflictType} — ${c.rootCause} Impact: ${c.directImpact}`));
      matches.forEach((c) => refs.push({ kind: 'conflict', code: sig(c), label: `${code} ${c.conflictType}` }));
      if (!code && matches.length) suggestions.push('Tip: include a course code, e.g. "Why is CSE301 conflicting?"');
      if (matches[0]) followUpActions.push({ label: 'Analyze best solution', view: 'conflicts', params: { conflict: matches[0].signature } });
      break;
    }
    case INTENTS.GROUP_CONFLICTS: {
      const token = extractGroupToken(q);
      const exact = token && state.studentGroups.some((g) => g.code === token) ? token : null;
      const prefix = exact ? null : token;
      const groups = state.studentGroups.filter((g) => (exact ? g.code === exact : prefix ? g.code.startsWith(prefix) || g.programCode.includes(prefix) : true));
      const groupIds = new Set(groups.map((g) => g.id));
      const matches = scopedConflicts.filter((c) => c.activities.some((a) => groupIds.has(a.studentGroupId)));
      const totalStudents = groups.reduce((s, g) => s + g.size, 0);
      contextSummary = `Conflicts affecting ${groups.length} student group(s) (${exact ?? prefix ?? 'all'}, ≈${totalStudents} students): ${matches.length}.`;
      facts.push(...matches.slice(0, 10).map((c) => `[${c.severity}] ${c.conflictType} — ${c.rootCause}`));
      groups.slice(0, 8).forEach((g) => refs.push({ kind: 'studentGroup', code: g.code, label: g.name }));
      matches.slice(0, 5).forEach((c) => refs.push({ kind: 'conflict', code: sig(c), label: c.conflictType }));
      break;
    }
    case INTENTS.BEST_SOLUTION: {
      const conflictCode = extractConflictCode(q);
      const courseCode = extractCourseCode(q);
      const target =
        (conflictCode ? findConflictByCode(allConflicts, conflictCode) : undefined) ??
        (courseCode ? allConflicts.find((c) => c.affectedResources.courses.includes(courseCode) && c.category === 'HARD') : undefined) ??
        allConflicts.find((c) => c.severity === 'CRITICAL') ??
        allConflicts[0];
      if (target) {
        const { generateCandidates, scoreAndRank } = await import('@/lib/engine');
        const candidates = scoreAndRank(state, generateCandidates(state, rules, target), target);
        const best = candidates.find((c) => c.valid);
        contextSummary = `Best solution for ${target.conflictType}: ${best ? `"${best.title}" (score ${best.score}/100, engine-validated: no new hard conflicts)` : 'no valid automatic solution found'}.`;
        facts.push(`Conflict: ${target.rootCause}`, `Recommended: ${best?.title}`, `Engine validation: ${best ? `target resolved=${best.validationReport.targetConflictResolved}, new hard conflicts=${best.validationReport.newHardConflicts.length}` : 'n/a'}`);
        refs.push({ kind: 'conflict', code: sig(target), label: target.conflictType });
        followUpActions.push({ label: 'Run full Agentic AI analysis', view: 'conflicts', params: { conflict: target.signature } });
      } else {
        contextSummary = 'No conflicts available to solve.';
      }
      break;
    }
    case INTENTS.WHAT_IF: {
      const actCode = extractActivityCode(q);
      const act = state.activities.find((a) => a.activityCode === actCode) ?? nearestActivity(q, state);
      const targetRoomCode = extractRoomCode(q);
      if (act && targetRoomCode) {
        const { runSimulation } = await import('@/lib/engine');
        const room = state.rooms.find((r) => r.code === targetRoomCode);
        const sim = runSimulation(state, rules, [{ activityId: act.id, field: 'roomId', value: room?.id ?? targetRoomCode }]);
        contextSummary = `What-if simulation for ${act.activityCode} (${act.courseCode} ${act.sectionCode}) → ${targetRoomCode}: ${sim.summary}`;
        facts.push(`Resolved: ${sim.conflictsResolved.map((r) => r.type).join(', ') || 'none'}`, `Created: ${sim.conflictsCreated.map((r) => r.type).join(', ') || 'none'}`, `Impact ${sim.overallImpact} (${sim.impactScore})`);
        refs.push({ kind: 'activity', code: act.activityCode, label: `${act.courseCode} ${act.sectionCode}` });
        if (room) refs.push({ kind: 'room', code: room.code, label: room.name });
        followUpActions.push({ label: 'Open What-If Simulator with this change', view: 'whatif', params: { activity: act.id, room: room?.id ?? '' } });
      } else if (act) {
        contextSummary = `Found activity ${act.activityCode} (${act.courseCode} ${act.sectionCode}, ${act.date} ${minutesToHHMM(act.startMin)}–${minutesToHHMM(act.endMin)} in ${act.roomCode}). To simulate a move, mention a destination room, e.g. "move ${act.activityCode} to B24-201".`;
        facts.push(`Current: ${act.courseCode} ${act.sectionCode} ${act.date} ${minutesToHHMM(act.startMin)}–${minutesToHHMM(act.endMin)} @ ${act.roomCode} (${act.facultyName}, ${act.studentGroupCode})`);
        refs.push({ kind: 'activity', code: act.activityCode, label: act.courseName });
        followUpActions.push({ label: 'Open What-If Simulator', view: 'whatif', params: { activity: act.id } });
      } else {
        contextSummary = 'No matching activity found. Mention an activity code (e.g. ACT-0042) or course.';
      }
      break;
    }
    case INTENTS.EXAM_CONFLICTS: {
      const examConflicts = scopedConflicts.filter(
        (c) => c.conflictType === 'EXAM_GROUP_OVERLAP' || c.conflictType === 'EXAM_VENUE_INCOMPATIBLE' || c.activities.some((a) => a.activityType === 'EXAM')
      );
      contextSummary = `Examination-related conflicts: ${examConflicts.length}.`;
      facts.push(...examConflicts.map((c) => `[${c.severity}] ${c.conflictType} — ${c.rootCause}`));
      examConflicts.forEach((c) => refs.push({ kind: 'conflict', code: sig(c), label: c.conflictType }));
      break;
    }
    case INTENTS.UNDERUTILIZED_ROOMS: {
      const { roomUtilization } = await import('@/lib/engine');
      const utils = roomUtilization(state, rules).filter((r) => r.roomType === 'CLASSROOM' || r.roomType === 'LABORATORY');
      const idle = utils.filter((r) => r.hours === 0);
      const low = utils.filter((r) => r.hours > 0 && r.usedPct < 10).sort((a, b) => a.usedPct - b.usedPct).slice(0, 6);
      contextSummary = `Idle rooms (zero bookings in the window): ${idle.length}; lowest-utilization active rooms: ${low.map((r) => `${r.code} (${r.usedPct}%)`).join(', ')}.`;
      facts.push(`Idle: ${idle.map((r) => `${r.code} (${r.name}, ${r.blockCode})`).join('; ') || 'none'}`, `Low: ${low.map((r) => `${r.code} ${r.usedPct}% (${r.hours}h)`).join('; ') || 'none'}`);
      idle.slice(0, 6).forEach((r) => refs.push({ kind: 'room', code: r.code, label: `${r.name} — idle` }));
      low.forEach((r) => refs.push({ kind: 'room', code: r.code, label: `${r.name} — ${r.usedPct}%` }));
      break;
    }
    case INTENTS.FACULTY_WORKLOAD: {
      const wl = facultyWeeklyHours(state)
        .map((f) => ({ ...f, loadPct: Math.round((f.hours / Math.max(1, f.max)) * 100) }))
        .filter((f) => f.hours > f.max)
        .sort((a, b) => b.loadPct - a.loadPct);
      contextSummary = `Faculty exceeding workload policy: ${wl.length}.`;
      facts.push(...wl.map((f) => `${f.name} (${f.schoolCode}): ${f.hours}h vs limit ${f.max}h — ${f.loadPct}% of cap`));
      wl.forEach((f) => refs.push({ kind: 'faculty', code: f.name, label: `${f.name} — ${f.hours}h/${f.max}h` }));
      break;
    }
    case INTENTS.CRITICAL_BY_BLOCK: {
      const block = extractBlockCode(q);
      const matches = scopedConflicts.filter(
        (c) => c.severity === 'CRITICAL' && (!block || c.affectedResources.blocks.some((b) => b === block))
      );
      contextSummary = `Critical conflicts ${block ? `in ${block}` : 'across campus'}: ${matches.length}.`;
      facts.push(...matches.map((c) => `${c.conflictType} — ${c.rootCause}`));
      matches.forEach((c) => refs.push({ kind: 'conflict', code: sig(c), label: `${c.conflictType} ${c.affectedResources.blocks.join('/')}` }));
      break;
    }
    case INTENTS.SCHEDULE_LOOKUP: {
      const { date, label } = resolveDate(q);
      const acts = state.activities.filter((a) => (date ? a.date === date : true) && a.activityType !== 'EXAM');
      const byType: Record<string, number> = {};
      acts.forEach((a) => (byType[a.activityType] = (byType[a.activityType] ?? 0) + 1));
      contextSummary = `${acts.length} activities ${date ? `on ${date} (${label})` : 'in the current window'}: ${Object.entries(byType).map(([t, n]) => `${t} ${n}`).join(', ')}.`;
      const sample = acts.slice(0, 8).map((a) => `${a.activityCode} ${a.courseCode} ${a.sectionCode} ${DAY_SHORT[a.dayOfWeek]} ${minutesToHHMM(a.startMin)} ${a.roomCode} (${a.facultyName})`);
      facts.push(...sample);
      sample.slice(0, 5).forEach((s) => {
        const code = s.split(' ')[0];
        const a = state.activities.find((x) => x.activityCode === code);
        if (a) refs.push({ kind: 'activity', code: a.activityCode, label: `${a.courseCode} ${a.sectionCode}` });
      });
      break;
    }
    case INTENTS.CONFLICT_OVERVIEW:
    default: {
      const counts: Record<string, number> = {};
      scopedConflicts.forEach((c) => (counts[c.severity] = (counts[c.severity] ?? 0) + 1));
      const typeCounts: Record<string, number> = {};
      scopedConflicts.forEach((c) => (typeCounts[c.conflictType] = (typeCounts[c.conflictType] ?? 0) + 1));
      contextSummary = `Current conflict situation: ${scopedConflicts.length} active (${counts.CRITICAL ?? 0} critical, ${counts.HIGH ?? 0} high, ${counts.MEDIUM ?? 0} medium, ${counts.LOW ?? 0} low).`;
      facts.push(`By type: ${Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t.replace(/_/g, ' ').toLowerCase()} ${n}`).join(', ')}`);
      scopedConflicts.filter((c) => c.severity === 'CRITICAL' || c.severity === 'HIGH').slice(0, 8).forEach((c) => {
        facts.push(`[${c.severity}] ${c.conflictType}: ${c.rootCause}`);
        refs.push({ kind: 'conflict', code: sig(c), label: `${c.conflictType} (${c.severity})` });
      });
      suggestions.push(
        'Ask: "Find all room conflicts tomorrow"',
        'Ask: "Why is CSE301 conflicting?"',
        'Ask: "Which faculty members have excessive workload?"'
      );
      break;
    }
  }

  // ---- compose the final answer with the LLM over retrieved facts ----
  const scopeNote =
    user.role === 'FACULTY'
      ? `You are answering ${user.name} (faculty). Only conflicts involving their own teaching are in scope.`
      : user.role === 'STUDENT'
        ? `You are answering ${user.name} (student). Only conflicts involving their own student group are in scope.`
        : `You are answering ${user.name} (${user.role}).`;

  const llm = await llmComplete(
    `You are the LPU AI Scheduling Assistant for Lovely Professional University. ${scopeNote}
RULES:
- Use ONLY the verified facts provided. NEVER invent courses, faculty, rooms, conflicts, times or numbers.
- If the facts do not contain the answer, say so plainly and suggest what to ask instead.
- Be concise and structured: short intro line, bullet points with concrete codes/times, and one next-step recommendation.
- Reference schedule records by their codes (ACT-xxxx, CFLT-xxxx, room codes, course codes).
Available conversation context: ${history.slice(-6).map((m) => `${m.role}: ${m.content.slice(0, 200)}`).join(' | ')}`,
    `User question: ${q}
Verified facts retrieved from the scheduling engine and database:
${facts.map((f) => `- ${f}`).join('\n') || '- (no matching records)'}
Compose the answer now.`,
    { retries: 1, maxOutputChars: 2200 }
  );

  let answer: string;
  if (llm.ok) {
    answer = llm.content;
  } else {
    answer = fallbackAnswer(q, intent, contextSummary, facts);
  }

  return {
    answer,
    source: llm.ok ? 'llm' : 'fallback',
    intent: String(intent),
    references: refs.slice(0, 12),
    facts: facts.slice(0, 14),
    suggestions,
    followUpActions,
  };
}

// ---------------------------------------------------------------- helpers

function classify(q: string, _conflictCount: number): string {
  const l = q.toLowerCase();
  const hasConflicts = l.includes('conflict') || l.includes('clash') || l.includes('overlap') || l.includes('double');
  if (hasConflicts && (l.includes('room') || l.includes('classroom') || l.includes('hall') || l.includes('lab ')) && (l.includes('today') || l.includes('tomorrow') || /\d{4}-\d{2}-\d{2}/.test(l) || l.includes('monday') || l.includes('tuesday') || l.includes('wednesday') || l.includes('thursday') || l.includes('friday') || l.includes('saturday'))) return INTENTS.ROOM_CONFLICTS_DATE;
  if ((l.includes('why') || l.includes('reason') || hasConflicts) && extractCourseCode(q)) return INTENTS.COURSE_CONFLICT;
  if (l.includes('best') || l.includes('recommend') || l.includes('solve') || l.includes('solution') || l.includes('fix')) return INTENTS.BEST_SOLUTION;
  if (l.includes('what happens') || l.includes('what if') || l.includes('move this') || l.includes('move ') && (extractRoomCode(q) || extractActivityCode(q))) return INTENTS.WHAT_IF;
  if (hasConflicts && (l.includes('student') || l.includes('cse') || l.includes('ece') || l.includes('mba') || l.includes('me ') || extractGroupToken(q))) return INTENTS.GROUP_CONFLICTS;
  if (l.includes('exam') && (hasConflicts || l.includes('schedule'))) return INTENTS.EXAM_CONFLICTS;
  if (l.includes('underutilized') || l.includes('under-utilized') || l.includes('idle') || l.includes('empty rooms') || l.includes('free rooms') || l.includes('vacant')) return INTENTS.UNDERUTILIZED_ROOMS;
  if (l.includes('workload') || l.includes('overload') || l.includes('load')) return INTENTS.FACULTY_WORKLOAD;
  if (l.includes('critical') && (extractBlockCode(q) || l.includes('block'))) return INTENTS.CRITICAL_BY_BLOCK;
  if (l.includes('how many') || l.includes('schedule for') || l.includes('classes') || l.includes('activities') || l.includes('timetable')) return INTENTS.SCHEDULE_LOOKUP;
  if (hasConflicts || l.includes('status') || l.includes('overview') || l.includes('summary')) return INTENTS.CONFLICT_OVERVIEW;
  return INTENTS.FALLBACK;
}

function scopeConflicts(conflicts: DetectedConflict[], user: SessionUser, state: ScheduleState): DetectedConflict[] {
  if (user.role === 'ADMIN' || user.role === 'SCHEDULER') return conflicts;
  if (user.role === 'FACULTY' && user.linkedFacultyId) {
    const faculty = state.faculty.find((f) => f.id === user.linkedFacultyId || f.code === user.linkedFacultyId);
    if (!faculty) return [];
    return conflicts.filter((c) => c.activities.some((a) => a.facultyId === faculty.id || a.facultyId === faculty.code));
  }
  if (user.role === 'STUDENT' && user.linkedGroupId) {
    const group = state.studentGroups.find((g) => g.id === user.linkedGroupId || g.code === user.linkedGroupId);
    if (!group) return [];
    return conflicts.filter((c) => c.activities.some((a) => a.studentGroupId === group.id || a.studentGroupId === group.code));
  }
  return [];
}

function sig(c: DetectedConflict): string {
  return c.signature.split('|')[1] ?? c.signature.slice(0, 12);
}

function findConflictByCode(conflicts: DetectedConflict[], code: string): DetectedConflict | undefined {
  // CFLT codes map to persisted rows; approximate via signature order (deterministic detection order)
  const idx = parseInt(code.replace('CFLT-', ''), 10);
  return Number.isFinite(idx) && idx >= 1 && idx <= conflicts.length ? conflicts[idx - 1] : undefined;
}

function nearestActivity(q: string, state: ScheduleState): EngineActivity | undefined {
  const code = extractCourseCode(q);
  if (code) return state.activities.find((a) => a.courseCode === code);
  return undefined;
}

function fallbackAnswer(q: string, intent: string, contextSummary: string, facts: string[]): string {
  const lines = [contextSummary, ''];
  if (facts.length) {
    lines.push('Verified details from the scheduling engine:');
    facts.slice(0, 10).forEach((f) => lines.push(`• ${f}`));
  } else {
    lines.push('No matching records were found in the current schedule data for this question.');
    lines.push('Try asking about room conflicts, a specific course (e.g. CSE301), exam conflicts, faculty workload, or underutilized rooms.');
  }
  lines.push('', '(Answer composed from deterministic engine output — AI language service unavailable.)');
  return lines.join('\n');
}
