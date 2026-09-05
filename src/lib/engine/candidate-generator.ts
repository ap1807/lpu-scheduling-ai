/**
 * LPU Scheduling Engine — Candidate Resolution Generator (DETERMINISTIC SEARCH)
 * ------------------------------------------------------------------------------
 * Given a detected conflict, systematically searches the real schedule state
 * for candidate fixes:
 *   alternative rooms / labs / exam venues, alternative time slots, alternative
 *   dates, room swaps, faculty swaps, and combined changes.
 * Every candidate is then handed to the constraint validator (independent
 * engine module) — the generator itself NEVER declares a solution valid.
 */
import { detectConflicts } from './conflict-detector';
import { validateChanges } from './constraint-validator';
import {
  CandidateSolution, ChangeSpec, DetectedConflict, EngineActivity, EngineRoom,
  ScheduleState, SolutionType, SchedulingRuleConfig,
} from './types';
import { DAY_SHORT, addDays, dayOfWeek, durationLabel, hitsUnavailability, minutesToHHMM, overlaps } from './util';

interface RoomFitness {
  room: EngineRoom;
  fillPct: number;
}

/** All rooms that could host `act` at its CURRENT date/time (free, right type, capacity, available). */
export function findFreeRoomsFor(
  state: ScheduleState,
  rules: SchedulingRuleConfig,
  act: EngineActivity,
  opts: { sameBlockFirst?: boolean; excludeRoomIds?: Set<string>; date?: string; startMin?: number; endMin?: number } = {}
): RoomFitness[] {
  const date = opts.date ?? act.date;
  const startMin = opts.startMin ?? act.startMin;
  const endMin = opts.endMin ?? act.endMin;
  const day = dayOfWeek(date);
  const exclude = opts.excludeRoomIds ?? new Set<string>();

  const busy = new Map<string, EngineActivity[]>();
  for (const a of state.activities) {
    if (a.status === 'CANCELLED') continue;
    if (a.date !== date) continue;
    if (!overlaps(startMin, endMin, a.startMin, a.endMin)) continue;
    const arr = busy.get(a.roomId);
    if (arr) arr.push(a);
    else busy.set(a.roomId, [a]);
  }

  const results: RoomFitness[] = [];
  for (const room of state.rooms) {
    if (exclude.has(room.id)) continue;
    if (room.id === act.roomId) continue;
    // Type compatibility
    if (act.activityType === 'LAB' && room.roomType !== 'LABORATORY') continue;
    if (act.activityType === 'EXAM' && rules.examVenueStrict && !room.isExamVenue) continue;
    if (act.activityType !== 'EXAM' && act.activityType !== 'EVENT' && room.roomType === 'EXAM_VENUE') continue; // keep exam venues for exams
    if ((act.activityType === 'CLASS' || act.activityType === 'TUTORIAL') && room.roomType !== 'CLASSROOM') continue; // theory classes belong in classrooms
    if (act.activityType === 'SEMINAR' && room.roomType !== 'SEMINAR_HALL' && room.roomType !== 'AUDITORIUM') continue;
    if (act.activityType === 'EVENT' && room.roomType !== 'AUDITORIUM' && room.roomType !== 'EVENT_VENUE' && room.roomType !== 'SEMINAR_HALL') continue;
    // Capacity
    if (room.capacity < act.capacityRequired) continue;
    // Busy?
    if (busy.has(room.id)) continue;
    // Unavailability
    if (hitsUnavailability(date, day, startMin, endMin, room.unavailable)) continue;
    results.push({ room, fillPct: act.capacityRequired > 0 ? Math.round((act.capacityRequired / room.capacity) * 100) : 0 });
  }

  // Rank: same block first, then best capacity fit (fill 70-100% ideal)
  results.sort((a, b) => {
    const aSame = a.room.blockId === act.blockId ? 0 : 1;
    const bSame = b.room.blockId === act.blockId ? 0 : 1;
    if (aSame !== bSame) return aSame - bSame;
    const aScore = Math.abs(a.fillPct - 85);
    const bScore = Math.abs(b.fillPct - 85);
    return aScore - bScore;
  });
  return results;
}

/** All standard time slots on `date` where the activity (same room) is conflict-free for room+faculty+group. */
export function findFreeSlotsFor(
  state: ScheduleState,
  rules: SchedulingRuleConfig,
  act: EngineActivity,
  date: string,
  durationMin?: number
): Array<{ startMin: number; endMin: number }> {
  const dur = durationMin ?? act.endMin - act.startMin;
  const day = dayOfWeek(date);
  const slots: Array<{ startMin: number; endMin: number }> = [];

  const clashing = (startMin: number, endMin: number): EngineActivity[] => {
    const hits: EngineActivity[] = [];
    for (const a of state.activities) {
      if (a.status === 'CANCELLED' || a.id === act.id) continue;
      if (a.date !== date) continue;
      const resourceMatch = a.roomId === act.roomId || a.facultyId === act.facultyId || a.studentGroupId === act.studentGroupId;
      if (resourceMatch && overlaps(startMin, endMin, a.startMin, a.endMin)) hits.push(a);
    }
    return hits;
  };

  for (const slot of rules.standardSlots) {
    const alignedStart = slot.startMin;
    const endMin = alignedStart + dur;
    if (endMin > slot.endMin + 30) continue;
    if (clashing(alignedStart, endMin).length > 0) continue;
    if (hitsUnavailability(date, day, alignedStart, endMin, state.rooms.find((r) => r.id === act.roomId)?.unavailable ?? [])) continue;
    if (hitsUnavailability(date, day, alignedStart, endMin, state.faculty.find((f) => f.id === act.facultyId)?.unavailable ?? [])) continue;
    slots.push({ startMin: alignedStart, endMin });
  }

  return slots;
}

/** Alternative working dates (same week ±) where room+faculty+group are free at the same time. */
export function findFreeDatesFor(
  state: ScheduleState,
  rules: SchedulingRuleConfig,
  act: EngineActivity
): string[] {
  const dates: string[] = [];
  const dur = act.endMin - act.startMin;
  for (let offset = -3; offset <= 4; offset++) {
    if (offset === 0) continue;
    const d = addDays(act.date, offset);
    const day = dayOfWeek(d);
    if (!rules.allowedDays.includes(day)) continue;
    const clash = state.activities.some(
      (a) =>
        a.status !== 'CANCELLED' &&
        a.id !== act.id &&
        a.date === d &&
        (a.roomId === act.roomId || a.facultyId === act.facultyId || a.studentGroupId === act.studentGroupId) &&
        overlaps(act.startMin, act.startMin + dur, a.startMin, a.endMin)
    );
    if (!clash) dates.push(d);
  }
  return dates;
}

function solutionTypeFor(act: EngineActivity, fields: Set<string>): SolutionType {
  const combined = fields.size > 1;
  if (combined) return 'COMBINED';
  if (fields.has('roomId')) {
    if (act.activityType === 'EXAM') return 'MOVE_EXAM_VENUE';
    if (act.activityType === 'LAB') return 'REASSIGN_LAB';
    if (act.activityType === 'EVENT') return 'MOVE_EVENT';
    return 'REASSIGN_ROOM';
  }
  if (fields.has('startMin') || fields.has('endMin')) {
    if (act.activityType === 'EXAM') return 'CHANGE_EXAM_TIME';
    return 'CHANGE_TIME_SLOT';
  }
  if (fields.has('date')) return act.activityType === 'EXAM' ? 'RESCHEDULE_CLASS' : 'RESCHEDULE_CLASS';
  return 'RESCHEDULE_CLASS';
}

function mkChange(
  act: EngineActivity,
  field: ChangeSpec['field'],
  from: string | number,
  to: string | number,
  displayLabel: string,
  displayFrom: string,
  displayTo: string
): ChangeSpec {
  return { activityId: act.id, activityCode: act.activityCode, field, from, to, displayLabel, displayFrom, displayTo };
}

/**
 * Generate candidate solutions for a conflict.
 * Each candidate gets a preliminary validation by the engine (independent module).
 * Returns valid + invalid candidates (invalid ones are shown as rejected-by-engine).
 */
export function generateCandidates(
  state: ScheduleState,
  rules: SchedulingRuleConfig,
  conflict: DetectedConflict,
  limits = { rooms: 6, slots: 4, dates: 3, swaps: 2, faculty: 2 }
): CandidateSolution[] {
  const candidates: CandidateSolution[] = [];
  const seen = new Set<string>();
  const baseline = detectConflicts(state, rules);

  // Primary activity to relocate: prefer non-EXAM, the one with smaller group when types differ
  const acts = conflict.activities.filter((a) => a.status !== 'CANCELLED');
  const targets = acts.length > 0 ? acts : [];

  const addCandidate = (
    act: EngineActivity,
    changes: ChangeSpec[],
    title: string,
    benefits: string[],
    sideEffects: string[],
    meta: Record<string, unknown>
  ) => {
    const key = changes.map((c) => `${c.activityId}:${c.field}:${c.to}`).join('|');
    if (seen.has(key)) return;
    seen.add(key);
    const vr = validateChanges(state, rules, changes, conflict, baseline);
    const fields = new Set(changes.map((c) => c.field));
    candidates.push({
      solutionType: solutionTypeFor(act, fields),
      title,
      changes,
      valid: vr.valid,
      validationReport: vr.report,
      score: 0, // scored by scoring module
      reasoning: '', // filled by AI layer
      expectedBenefits: benefits,
      sideEffects,
      meta,
    });
  };

  for (const act of targets) {
    // ---- 1. Alternative rooms (labs / exam venues / classrooms)
    const roomFits = findFreeRoomsFor(state, rules, act).slice(0, limits.rooms);
    for (const fit of roomFits) {
      const room = fit.room;
      addCandidate(
        act,
        [mkChange(act, 'roomId', act.roomId, room.id, 'Room', `${act.roomCode} (${act.roomName})`, `${room.code} (${room.name})`)],
        `Move ${act.courseCode} ${act.sectionCode} to ${room.code} (${room.name})`,
        [
          `Eliminates the overlap: ${room.code} is free on ${act.date} ${durationLabel(act.startMin, act.endMin)}`,
          `Capacity ${room.capacity} seats for ${act.capacityRequired} students (${fit.fillPct}% fill)`,
          room.blockId === act.blockId ? `Same academic block (${room.blockCode}) — no extra student movement` : `Block ${room.blockCode} — ${room.blockId === act.blockId ? 'same' : 'different'} block relocation`,
        ],
        [
          `Students relocate to ${room.blockCode}${room.blockId !== act.blockId ? ' (different block)' : ''}`,
          `${act.facultyName} must be informed of the venue change`,
        ],
        { roomId: room.id, roomCode: room.code, capacity: room.capacity, fillPct: fit.fillPct }
      );
    }

    // ---- 2. Alternative time slots (same room, same date)
    const slots = findFreeSlotsFor(state, rules, act, act.date).filter((s) => s.startMin !== act.startMin).slice(0, limits.slots);
    for (const slot of slots) {
      addCandidate(
        act,
        [mkChange(act, 'startMin', act.startMin, slot.startMin, 'Time', durationLabel(act.startMin, act.endMin), durationLabel(slot.startMin, slot.endMin))],
        `Shift ${act.courseCode} ${act.sectionCode} to ${minutesToHHMM(slot.startMin)} on ${DAY_SHORT[dayOfWeek(act.date)]}`,
        [
          `${act.roomCode}, ${act.facultyName} and ${act.studentGroupCode} are all free ${durationLabel(slot.startMin, slot.endMin)}`,
          `Room assignment unchanged — minimal logistics`,
        ],
        [
          `${act.studentGroupCode} timetable shifts; students must be notified`,
          `${act.facultyName} teaching hour moves to ${minutesToHHMM(slot.startMin)}`,
        ],
        { startMin: slot.startMin }
      );
    }

    // ---- 3. Alternative dates (same room, same time)
    const dates = findFreeDatesFor(state, rules, act).slice(0, limits.dates);
    for (const d of dates) {
      addCandidate(
        act,
        [mkChange(act, 'date', act.date, d, 'Date', act.date, d)],
        `Reschedule ${act.courseCode} ${act.sectionCode} to ${DAY_SHORT[dayOfWeek(d)]} ${d} (same time ${durationLabel(act.startMin, act.endMin)})`,
        [
          `${act.roomCode}, ${act.facultyName} and ${act.studentGroupCode} free on that date at this time`,
          `Weekly contact hours preserved`,
        ],
        [
          `${act.studentGroupCode} gets a different weekly rhythm; check for gaps`,
          `Course distribution across the week changes`,
        ],
        { date: d }
      );
    }

    // ---- 4. Faculty swap handled in dedicated block below
  }

  // ---- Faculty swap candidates (only for faculty conflicts)
  if (conflict.conflictType === 'FACULTY_TIME_OVERLAP' || conflict.conflictType === 'FACULTY_UNAVAILABLE') {
    for (const act of targets) {
      const busyFaculty = new Set(
        state.activities
          .filter((a) => a.status !== 'CANCELLED' && a.id !== act.id && a.date === act.date && overlaps(act.startMin, act.endMin, a.startMin, a.endMin))
          .map((a) => a.facultyId)
      );
      const alt = state.faculty
        .filter((f) => f.id !== act.facultyId && f.schoolCode === act.schoolCode && !busyFaculty.has(f.id))
        .filter((f) => !hitsUnavailability(act.date, act.dayOfWeek, act.startMin, act.endMin, f.unavailable))
        .slice(0, limits.faculty);
      for (const f of alt) {
        addCandidate(
          act,
          [mkChange(act, 'facultyId', act.facultyId, f.id, 'Faculty', act.facultyName, `${f.name} (${f.code})`)],
          `Reassign ${act.courseCode} ${act.sectionCode} to ${f.name}`,
          [
            `${f.name} (${f.designation}, ${f.schoolCode}) is free on ${act.date} ${durationLabel(act.startMin, act.endMin)}`,
            `Same school — subject expertise likely overlaps`,
          ],
          [
            `Faculty substitution must be academically approved by ${act.schoolCode}`,
            `${f.name} takes additional teaching load`,
          ],
          { facultyId: f.id, facultyName: f.name }
        );
      }
    }
  }

  // ---- 5. Room swap candidates (for room overlaps)
  if (conflict.conflictType === 'ROOM_TIME_OVERLAP') {
    for (const act of targets) {
      const swappers = state.activities
        .filter(
          (a) =>
            a.status !== 'CANCELLED' &&
            a.id !== act.id &&
            a.date === act.date &&
            overlaps(act.startMin, act.endMin, a.startMin, a.endMin) &&
            a.studentGroupId !== act.studentGroupId &&
            a.roomId !== act.roomId
        )
        .filter((a) => {
          const theirRoom = state.rooms.find((r) => r.id === a.roomId);
          const ourRoom = state.rooms.find((r) => r.id === act.roomId);
          if (!theirRoom || !ourRoom) return false;
          // their room must fit our activity; our room must fit theirs
          if (theirRoom.capacity < act.capacityRequired) return false;
          if (ourRoom.capacity < a.capacityRequired) return false;
          if (act.activityType === 'LAB' && theirRoom.roomType !== 'LABORATORY') return false;
          if (a.activityType === 'LAB' && ourRoom.roomType !== 'LABORATORY') return false;
          if (act.activityType === 'EXAM' && rules.examVenueStrict && !theirRoom.isExamVenue) return false;
          if (a.activityType === 'EXAM' && rules.examVenueStrict && !ourRoom.isExamVenue) return false;
          return true;
        })
        .slice(0, limits.swaps);
      for (const other of swappers) {
        const ourRoom = state.rooms.find((r) => r.id === act.roomId);
        const theirRoom = state.rooms.find((r) => r.id === other.roomId);
        addCandidate(
          act,
          [
            mkChange(act, 'roomId', act.roomId, other.roomId, 'Room', `${act.roomCode}`, `${theirRoom?.code}`),
            mkChange(other, 'roomId', other.roomId, act.roomId, 'Room', `${other.roomCode}`, `${ourRoom?.code}`),
          ],
          `Swap rooms: ${act.courseCode} ${act.sectionCode} ↔ ${other.courseCode} ${other.sectionCode} (${theirRoom?.code} ↔ ${ourRoom?.code})`,
          [
            `Both activities keep their time slots; only rooms exchange`,
            `Capacity fits both ways: ${theirRoom?.capacity} for ${act.capacityRequired}, ${ourRoom?.capacity} for ${other.capacityRequired}`,
          ],
          [
            `Two sections are affected — broader communication needed`,
            `Both student groups change venue`,
          ],
          { swapWithActivity: other.activityCode }
        );
      }
    }
  }

  // ---- 6. Combined: room + time (best room at a shifted slot when nothing else works)
  if (candidates.filter((c) => c.valid).length === 0) {
    for (const act of targets) {
      const slots = findFreeSlotsFor(state, rules, act, act.date).filter((s) => s.startMin !== act.startMin).slice(0, 2);
      for (const slot of slots) {
        const rooms = findFreeRoomsFor(state, rules, act, { date: act.date, startMin: slot.startMin, endMin: slot.endMin }).slice(0, 2);
        for (const fit of rooms) {
          addCandidate(
            act,
            [
              mkChange(act, 'roomId', act.roomId, fit.room.id, 'Room', act.roomCode, fit.room.code),
              mkChange(act, 'startMin', act.startMin, slot.startMin, 'Time', durationLabel(act.startMin, act.endMin), durationLabel(slot.startMin, slot.endMin)),
            ],
            `Combined: move ${act.courseCode} ${act.sectionCode} to ${fit.room.code} at ${minutesToHHMM(slot.startMin)}`,
            ['Combines venue and time change to avoid all clashes'],
            ['Larger disruption — both venue and timing change'],
            { roomId: fit.room.id, startMin: slot.startMin }
          );
        }
      }
    }
  }

  return candidates;
}
