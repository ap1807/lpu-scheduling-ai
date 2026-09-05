/**
 * LPU Scheduling Engine — Conflict Detection (DETERMINISTIC, no AI)
 * ------------------------------------------------------------------
 * Detects hard conflicts (schedule impossible / rule violated) and
 * soft conflicts (schedule quality issues) over the complete schedule
 * state. Every conflict carries structured root cause, direct impact,
 * affected resources and a deterministic signature used for diffing
 * (what-if simulation + cascading analysis).
 */
import {
  ActivityType, AffectedResources, CascadeNode, ConflictType, DetectedConflict,
  EngineActivity, EngineFaculty, EngineRoom, ScheduleState, SchedulingRuleConfig, Severity,
} from './types';
import { DAY_NAMES, activityLabel, durationLabel, hitsUnavailability, minutesToHHMM, uniqueSorted } from './util';

// ------------------------------------------------------------------ helpers

function severityFor(type: ConflictType): Severity {
  switch (type) {
    case 'ROOM_TIME_OVERLAP':
    case 'FACULTY_TIME_OVERLAP':
    case 'STUDENT_GROUP_OVERLAP':
    case 'EXAM_GROUP_OVERLAP':
      return 'CRITICAL';
    case 'ROOM_CAPACITY_INSUFFICIENT':
    case 'ROOM_TYPE_MISMATCH':
    case 'EXAM_VENUE_INCOMPATIBLE':
    case 'FACULTY_UNAVAILABLE':
    case 'ROOM_UNAVAILABLE':
    case 'DUPLICATE_ACTIVITY':
    case 'INVALID_TIME':
    case 'RESOURCE_MISSING':
      return 'HIGH';
    default:
      return 'MEDIUM';
  }
}

function softSeverity(type: ConflictType): Severity {
  switch (type) {
    case 'FACULTY_OVERLOAD':
    case 'STUDENT_TIMETABLE_GAPS':
    case 'FACULTY_PREFERENCE_VIOLATION':
    case 'STUDENT_PREFERENCE_VIOLATION':
      return 'MEDIUM';
    default:
      return 'LOW';
  }
}

function isHard(type: ConflictType): boolean {
  switch (type) {
    case 'ROOM_TIME_OVERLAP':
    case 'FACULTY_TIME_OVERLAP':
    case 'STUDENT_GROUP_OVERLAP':
    case 'EXAM_GROUP_OVERLAP':
    case 'ROOM_CAPACITY_INSUFFICIENT':
    case 'ROOM_TYPE_MISMATCH':
    case 'EXAM_VENUE_INCOMPATIBLE':
    case 'FACULTY_UNAVAILABLE':
    case 'ROOM_UNAVAILABLE':
    case 'DUPLICATE_ACTIVITY':
    case 'INVALID_TIME':
    case 'RESOURCE_MISSING':
      return true;
    default:
      return false;
  }
}

export function isHardConflictType(type: ConflictType): boolean {
  return isHard(type);
}

function resourcesOf(activities: EngineActivity[]): AffectedResources {
  return {
    rooms: uniqueSorted(activities.map((a) => a.roomCode)),
    faculty: uniqueSorted(activities.map((a) => a.facultyName)),
    studentGroups: uniqueSorted(activities.map((a) => a.studentGroupCode)),
    courses: uniqueSorted(activities.map((a) => a.courseCode)),
    blocks: uniqueSorted(activities.map((a) => a.blockCode)),
    dates: uniqueSorted(activities.map((a) => a.date)),
  };
}

function mkConflict(
  conflictType: ConflictType,
  activities: EngineActivity[],
  rootCause: string,
  directImpact: string,
  cascadingImpact: CascadeNode[],
  signature: string,
  resourcesOverride?: Partial<AffectedResources>
): DetectedConflict {
  const hard = isHard(conflictType);
  const base = resourcesOf(activities);
  return {
    conflictType,
    category: hard ? 'HARD' : 'SOFT',
    severity: hard ? severityFor(conflictType) : softSeverity(conflictType),
    activityIds: activities.map((a) => a.id),
    activities,
    affectedResources: { ...base, ...resourcesOverride },
    rootCause,
    directImpact,
    cascadingImpact,
    signature,
  };
}

function sig(parts: (string | number)[]): string {
  return parts.map(String).join('|');
}

/** True when two activities are the same session double-entered (duplicate booking).
 *  Such pairs are reported once as DUPLICATE_ACTIVITY, not as room/faculty/group overlaps. */
function isDuplicatePair(a: EngineActivity, b: EngineActivity): boolean {
  return (
    a.courseCode === b.courseCode &&
    a.sectionCode === b.sectionCode &&
    a.activityType === b.activityType &&
    a.date === b.date &&
    a.startMin === b.startMin
  );
}

// ------------------------------------------------------------------ main

export function detectConflicts(state: ScheduleState, rules: SchedulingRuleConfig): DetectedConflict[] {
  const conflicts: DetectedConflict[] = [];
  const activities = state.activities.filter((a) => a.status !== 'CANCELLED');

  // Index resources
  const roomById = new Map(state.rooms.map((r) => [r.id, r]));
  const roomByCode = new Map(state.rooms.map((r) => [r.code, r]));
  const facultyById = new Map(state.faculty.map((f) => [f.id, f]));
  const groupById = new Map(state.studentGroups.map((g) => [g.id, g]));

  // ---- buckets keyed by (resource, date) for pairwise overlap checks
  const byRoomDate = new Map<string, EngineActivity[]>();
  const byFacultyDate = new Map<string, EngineActivity[]>();
  const byGroupDate = new Map<string, EngineActivity[]>();
  const byCourseSectionDateType = new Map<string, EngineActivity[]>();

  for (const a of activities) {
    push(byRoomDate, `${a.roomId}|${a.date}`, a);
    push(byFacultyDate, `${a.facultyId}|${a.date}`, a);
    push(byGroupDate, `${a.studentGroupId}|${a.date}`, a);
    push(byCourseSectionDateType, `${a.courseCode}|${a.sectionCode}|${a.activityType}|${a.date}|${a.startMin}`, a);
  }

  // ================= per-activity integrity checks =================
  for (const a of activities) {
    const room = roomById.get(a.roomId) ?? roomByCode.get(a.roomCode);
    const faculty = facultyById.get(a.facultyId);
    const group = groupById.get(a.studentGroupId);

    // RESOURCE_MISSING
    if (!room || !faculty || !group) {
      const missing: string[] = [];
      if (!room) missing.push(`Room ${a.roomCode}`);
      if (!faculty) missing.push(`Faculty ${a.facultyName}`);
      if (!group) missing.push(`Student group ${a.studentGroupCode}`);
      conflicts.push(
        mkConflict(
          'RESOURCE_MISSING',
          [a],
          `Activity ${a.activityCode} references resources that do not exist in the LPU resource registry: ${missing.join(', ')}.`,
          `The schedule record cannot be validated and may be corrupted or reference a deleted resource.`,
          [
            { level: 1, resource: missing.join(', '), description: `Unresolved reference from ${a.activityCode} (${a.courseCode} ${a.sectionCode})` },
          ],
          sig(['RESOURCE_MISSING', a.id, missing.join(',')])
        )
      );
      continue; // cannot meaningfully check further
    }

    // INVALID_TIME
    const invalidTimeReasons: string[] = [];
    if (a.endMin <= a.startMin) invalidTimeReasons.push('end time is not after start time');
    const isEvent = a.activityType === 'EVENT';
    if (!isEvent) {
      if (a.startMin < rules.dayStartMin) invalidTimeReasons.push(`starts before teaching window (${minutesToHHMM(rules.dayStartMin)})`);
      if (a.endMin > rules.dayEndMin) invalidTimeReasons.push(`ends after teaching window (${minutesToHHMM(rules.dayEndMin)})`);
      if (!rules.allowedDays.includes(a.dayOfWeek) && a.dayOfWeek !== 0) invalidTimeReasons.push(`${DAY_NAMES[a.dayOfWeek]} is not a working day`);
    }
    if (invalidTimeReasons.length > 0) {
      conflicts.push(
        mkConflict(
          'INVALID_TIME',
          [a],
          `Activity ${a.activityCode} (${a.courseCode} ${a.sectionCode}) has an invalid time assignment: ${invalidTimeReasons.join('; ')}.`,
          `The timetable slot ${a.date} ${durationLabel(a.startMin, a.endMin)} is outside LPU scheduling policy and cannot be published.`,
          [{ level: 1, resource: a.roomCode, description: `Room ${a.roomCode} holds an activity outside allowed hours` }],
          sig(['INVALID_TIME', a.id, invalidTimeReasons.join(';')])
        )
      );
    }

    // ROOM_CAPACITY_INSUFFICIENT
    if (rules.capacityStrict && a.capacityRequired > room.capacity) {
      conflicts.push(
        mkConflict(
          'ROOM_CAPACITY_INSUFFICIENT',
          [a],
          `Activity ${a.activityCode} (${a.courseCode} ${a.sectionCode}) requires ${a.capacityRequired} seats but ${room.code} (${room.name}) has capacity ${room.capacity}.`,
          `${a.capacityRequired - room.capacity} students of ${a.studentGroupCode} would have no seating in ${room.code} on ${a.date} ${durationLabel(a.startMin, a.endMin)}.`,
          [
            { level: 1, resource: a.studentGroupCode, description: `${a.studentGroupCode} students risk overcrowding — fire-safety and attendance compliance risk` },
            { level: 1, resource: room.code, description: `${room.name} capacity exceeded by ${a.capacityRequired - room.capacity}` },
          ],
          sig(['ROOM_CAPACITY_INSUFFICIENT', a.id, room.id])
        )
      );
    }

    // ROOM_TYPE_MISMATCH (lab session must be in a lab; seminar in seminar hall/auditorium allowed)
    const needsLab = a.activityType === 'LAB';
    if (needsLab && room.roomType !== 'LABORATORY') {
      conflicts.push(
        mkConflict(
          'ROOM_TYPE_MISMATCH',
          [a],
          `Practical/LAB session ${a.activityCode} (${a.courseCode} ${a.sectionCode}) is booked in ${room.code} (${room.name}), which is a ${room.roomType}, not a laboratory.`,
          `Students cannot perform lab experiments without lab infrastructure (computers/instruments).`,
          [
            { level: 1, resource: a.studentGroupCode, description: `${a.studentGroupCode} loses hands-on practice for ${a.courseCode}` },
            { level: 1, resource: room.code, description: `${room.code} occupied without appropriate equipment` },
          ],
          sig(['ROOM_TYPE_MISMATCH', a.id, room.id])
        )
      );
    }

    // EXAM_VENUE_INCOMPATIBLE
    if (a.activityType === 'EXAM' && rules.examVenueStrict && !room.isExamVenue) {
      conflicts.push(
        mkConflict(
          'EXAM_VENUE_INCOMPATIBLE',
          [a],
          `Examination ${a.activityCode} (${a.courseCode} ${a.sectionCode}) is scheduled in ${room.code} (${room.name}) which is not an approved examination venue.`,
          `Exam conduct rules (invigilation layout, spacing, answer-sheet logistics) cannot be enforced in a non-exam room.`,
          [
            { level: 1, resource: a.studentGroupCode, description: `Exam integrity risk for ${a.studentGroupCode}` },
            { level: 1, resource: room.code, description: `${room.code} not certified for examinations` },
          ],
          sig(['EXAM_VENUE_INCOMPATIBLE', a.id, room.id])
        )
      );
    }

    // FACULTY_UNAVAILABLE
    const fUn = hitsUnavailability(a.date, a.dayOfWeek, a.startMin, a.endMin, faculty.unavailable);
    if (fUn) {
      conflicts.push(
        mkConflict(
          'FACULTY_UNAVAILABLE',
          [a],
          `Faculty ${faculty.name} is marked unavailable (${fUn.reason}) on ${DAY_NAMES[a.dayOfWeek]} ${durationLabel(fUn.startMin, fUn.endMin)}, but activity ${a.activityCode} (${a.courseCode} ${a.sectionCode}) is scheduled ${durationLabel(a.startMin, a.endMin)}.`,
          `${a.studentGroupCode} will have no instructor for ${a.courseCode} in that slot; the class cannot run as scheduled.`,
          [
            { level: 1, resource: faculty.name, description: `${faculty.name} unavailable — leave/committee duty` },
            { level: 1, resource: a.roomCode, description: `${a.roomCode} may sit empty if class is cancelled` },
          ],
          sig(['FACULTY_UNAVAILABLE', a.id, faculty.id, fUn.startMin])
        )
      );
    }

    // ROOM_UNAVAILABLE
    const rUn = hitsUnavailability(a.date, a.dayOfWeek, a.startMin, a.endMin, room.unavailable);
    if (rUn) {
      conflicts.push(
        mkConflict(
          'ROOM_UNAVAILABLE',
          [a],
          `Room ${room.code} (${room.name}) is unavailable (${rUn.reason}) on ${DAY_NAMES[a.dayOfWeek]} ${durationLabel(rUn.startMin, rUn.endMin)}, but activity ${a.activityCode} is scheduled there ${durationLabel(a.startMin, a.endMin)}.`,
          `${a.studentGroupCode} will have no venue for ${a.courseCode} on ${a.date}.`,
          [
            { level: 1, resource: room.code, description: `${room.name} blocked (${rUn.reason})` },
            { level: 1, resource: a.studentGroupCode, description: `${a.studentGroupCode} needs an alternative venue` },
          ],
          sig(['ROOM_UNAVAILABLE', a.id, room.id, rUn.startMin])
        )
      );
    }
  }

  // ================= pairwise overlaps =================
  for (const [key, bucket] of byRoomDate) {
    void key;
    detectPairs(bucket, (a, b) => {
      if (isDuplicatePair(a, b)) return;
      conflicts.push(
        mkConflict(
          'ROOM_TIME_OVERLAP',
          [a, b],
          `Two activities are booked in the same room at the same time: ${a.courseCode} ${a.sectionCode} and ${b.courseCode} ${b.sectionCode} both occupy ${a.roomCode} on ${a.date} during ${durationLabel(Math.min(a.startMin, b.startMin), Math.max(a.endMin, b.endMin))}.`,
          `The room can host only one of the two sessions; one class must be displaced. ${a.studentGroupCode} and ${b.studentGroupCode} cannot both attend in ${a.roomCode}.`,
          [
            { level: 1, resource: a.roomCode, activityId: a.id, activityCode: a.activityCode, description: `${a.courseCode} ${a.sectionCode} holds ${a.roomCode}` },
            { level: 1, resource: b.roomCode, activityId: b.id, activityCode: b.activityCode, description: `${b.courseCode} ${b.sectionCode} also holds ${b.roomCode}` },
            { level: 2, resource: `${a.studentGroupCode} / ${b.studentGroupCode}`, description: 'Displacing either class cascades into a new room search for the displaced group' },
            { level: 2, resource: `${a.facultyName} / ${b.facultyName}`, description: 'Faculty timetables and preparation plans are disrupted' },
          ],
          sig(['ROOM_TIME_OVERLAP', a.roomId, a.date, Math.min(a.startMin, b.startMin), Math.max(a.endMin, b.endMin), [a.id, b.id].sort().join(',')])
        )
      );
    });
  }

  for (const [, bucket] of byFacultyDate) {
    detectPairs(bucket, (a, b) => {
      if (isDuplicatePair(a, b)) return;
      conflicts.push(
        mkConflict(
          'FACULTY_TIME_OVERLAP',
          [a, b],
          `Faculty ${a.facultyName} is assigned to two activities at the same time: ${a.courseCode} ${a.sectionCode} (${a.roomCode}) and ${b.courseCode} ${b.sectionCode} (${b.roomCode}) on ${a.date} ${durationLabel(Math.min(a.startMin, b.startMin), Math.max(a.endMin, b.endMin))}.`,
          `The faculty member cannot teach both sessions simultaneously; one class will be unattended.`,
          [
            { level: 1, resource: a.facultyName, description: `Double-booked instructor ${a.facultyName}` },
            { level: 2, resource: `${a.studentGroupCode} / ${b.studentGroupCode}`, description: 'One of the two sections loses its lecture' },
          ],
          sig(['FACULTY_TIME_OVERLAP', a.facultyId, a.date, Math.min(a.startMin, b.startMin), Math.max(a.endMin, b.endMin), [a.id, b.id].sort().join(',')])
        )
      );
    });
  }

  for (const [, bucket] of byGroupDate) {
    detectPairs(bucket, (a, b) => {
      if (isDuplicatePair(a, b)) return;
      const bothExams = a.activityType === 'EXAM' && b.activityType === 'EXAM';
      const type: ConflictType = bothExams ? 'EXAM_GROUP_OVERLAP' : 'STUDENT_GROUP_OVERLAP';
      conflicts.push(
        mkConflict(
          type,
          [a, b],
          bothExams
            ? `Student group ${a.studentGroupCode} has two overlapping examinations: ${a.courseCode} (${a.roomCode}) and ${b.courseCode} (${b.roomCode}) on ${a.date} ${durationLabel(Math.min(a.startMin, b.startMin), Math.max(a.endMin, b.endMin))}.`
            : `Student group ${a.studentGroupCode} is expected in two places at once: ${a.courseCode} ${a.sectionCode} (${a.roomCode}) and ${b.courseCode} ${b.sectionCode} (${b.roomCode}) on ${a.date} ${durationLabel(Math.min(a.startMin, b.startMin), Math.max(a.endMin, b.endMin))}.`,
          bothExams
            ? `Students of ${a.studentGroupCode} cannot sit both exams; examination results for one paper would be void.`
            : `Students of ${a.studentGroupCode} must miss one of the two classes; attendance and continuity for both courses suffer.`,
          [
            { level: 1, resource: a.studentGroupCode, description: `${a.studentGroupCode} split across two venues` },
            { level: 2, resource: `${a.courseCode} / ${b.courseCode}`, description: 'Course continuity broken for both courses' },
          ],
          sig([type, a.studentGroupId, a.date, Math.min(a.startMin, b.startMin), Math.max(a.endMin, b.endMin), [a.id, b.id].sort().join(',')])
        )
      );
    });

    // Exam spacing check (same group, same day, gap < minGap)
    const exams = bucket.filter((a) => a.activityType === 'EXAM').sort((a, b) => a.startMin - b.startMin);
    for (let i = 0; i < exams.length - 1; i++) {
      const a = exams[i];
      const b = exams[i + 1];
      const gap = b.startMin - a.endMin;
      if (gap >= 0 && gap < rules.minGapBetweenExamsMin) {
        conflicts.push(
          mkConflict(
            'EXAM_GROUP_OVERLAP',
            [a, b],
            `Insufficient spacing between consecutive examinations for ${a.studentGroupCode} on ${a.date}: ${a.courseCode} ends ${minutesToHHMM(a.endMin)}, ${b.courseCode} starts ${minutesToHHMM(b.startMin)} (gap ${gap} min < required ${rules.minGapBetweenExamsMin} min).`,
            `Students get less than the mandated rest/transit time between papers; exam-conduct policy is violated.`,
            [{ level: 1, resource: a.studentGroupCode, description: `Back-to-back exam pressure for ${a.studentGroupCode}` }],
            sig(['EXAM_GAP', a.studentGroupId, a.date, a.id, b.id])
          )
        );
      }
    }
  }

  // ================= duplicate activities =================
  for (const [, bucket] of byCourseSectionDateType) {
    if (bucket.length > 1) {
      const [a, b] = bucket.slice(0, 2);
      conflicts.push(
        mkConflict(
          'DUPLICATE_ACTIVITY',
          [a, b],
          `Duplicate booking: ${a.courseCode} ${a.sectionCode} (${a.activityType}) appears ${bucket.length} times on ${a.date} ${durationLabel(a.startMin, a.endMin)} (${a.activityCode}, ${b.activityCode}).`,
          `The same session was entered twice — attendance, room occupancy and faculty workload statistics are inflated.`,
          [{ level: 1, resource: a.roomCode, description: 'Double-counted occupancy distorts room utilization analytics' }],
          sig(['DUPLICATE_ACTIVITY', a.courseCode, a.sectionCode, a.activityType, a.date, a.startMin])
        )
      );
    }
  }

  // ================= soft conflicts =================
  conflicts.push(...detectSoftConflicts(state, rules, activities));

  // Deduplicate by signature (keep first)
  const seen = new Set<string>();
  return conflicts.filter((c) => {
    if (seen.has(c.signature)) return false;
    seen.add(c.signature);
    return true;
  });
}

function push(map: Map<string, EngineActivity[]>, key: string, a: EngineActivity) {
  const arr = map.get(key);
  if (arr) arr.push(a);
  else map.set(key, [a]);
}

function detectPairs(bucket: EngineActivity[], onPair: (a: EngineActivity, b: EngineActivity) => void) {
  for (let i = 0; i < bucket.length; i++) {
    for (let j = i + 1; j < bucket.length; j++) {
      const a = bucket[i];
      const b = bucket[j];
      if (a.startMin < b.endMin && b.startMin < a.endMin) onPair(a, b);
    }
  }
}

// ------------------------------------------------------------------ soft conflicts

function detectSoftConflicts(
  state: ScheduleState,
  rules: SchedulingRuleConfig,
  activities: EngineActivity[]
): DetectedConflict[] {
  const conflicts: DetectedConflict[] = [];
  const facultyById = new Map(state.faculty.map((f) => [f.id, f]));
  const roomById = new Map(state.rooms.map((r) => [r.id, r]));
  const groupById = new Map(state.studentGroups.map((g) => [g.id, g]));

  // ---- Faculty weekly workload (event hosting is not teaching load)
  const teachingActs = activities.filter((a) => a.activityType !== 'EVENT');
  const facultyHours = new Map<string, number>();
  for (const a of teachingActs) {
    facultyHours.set(a.facultyId, (facultyHours.get(a.facultyId) ?? 0) + (a.endMin - a.startMin) / 60);
  }
  for (const [fid, hours] of facultyHours) {
    const f = facultyById.get(fid);
    if (!f) continue;
    if (hours > f.maxWeeklyHours) {
      const acts = activities.filter((a) => a.facultyId === fid);
      conflicts.push(
        mkConflict(
          'FACULTY_OVERLOAD',
          acts.slice(0, 8),
          `Faculty ${f.name} (${f.designation}, ${f.schoolCode}) is scheduled for ${hours.toFixed(1)} hours in the current window, exceeding the ${f.maxWeeklyHours}-hour weekly policy limit.`,
          `Teaching quality and UGC workload norms are at risk; ${f.name} may request schedule relief.`,
          [{ level: 1, resource: f.name, description: `${hours.toFixed(1)}h vs ${f.maxWeeklyHours}h limit` }],
          sig(['FACULTY_OVERLOAD', fid, Math.round(hours)])
        )
      );
    }
  }

  // ---- Faculty back-to-back chains (3+ consecutive without break; events excluded)
  for (const f of state.faculty) {
    const byDate = new Map<string, EngineActivity[]>();
    for (const a of teachingActs.filter((x) => x.facultyId === f.id)) push(byDate, a.date, a);
    for (const [date, list] of byDate) {
      const sorted = list.sort((a, b) => a.startMin - b.startMin);
      let chain: EngineActivity[] = [];
      let run = 1;
      let best: EngineActivity[] = [sorted[0]];
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const cur = sorted[i];
        const gap = cur.startMin - prev.endMin;
        if (gap < rules.minBreakBetweenClasses) {
          run++;
          chain.push(cur);
          if (run >= rules.maxConsecutiveClasses && best.length < run) best = [sorted[i - run + 1], ...chain.slice(1)];
        } else {
          run = 1;
          chain = [];
        }
      }
      if (run >= rules.maxConsecutiveClasses) {
        const involved = sorted.filter((a) => a.startMin >= (best[0]?.startMin ?? 0) - 0);
        const chainActs = sorted.filter((a) => {
          return a.startMin >= (best[0]?.startMin ?? 0) && a.startMin <= (best[best.length - 1]?.endMin ?? 0);
        });
        const used = chainActs.length ? chainActs : involved.slice(0, 3);
        conflicts.push(
          mkConflict(
            'FACULTY_BACK_TO_BACK',
            used,
            `Faculty ${f.name} teaches ${run}+ consecutive sessions on ${date} without a ${rules.minBreakBetweenClasses}-minute break (policy max: ${rules.maxConsecutiveClasses}).`,
            `No recovery/preparation time between classes on ${date}.`,
            [{ level: 1, resource: f.name, description: `Continuous teaching stretch on ${date}` }],
            sig(['FACULTY_BACK_TO_BACK', f.id, date, run])
          )
        );
      }
    }
  }

  // ---- Student group daily gaps
  for (const g of state.studentGroups) {
    const byDate = new Map<string, EngineActivity[]>();
    for (const a of activities.filter((x) => x.studentGroupId === g.id && x.activityType !== 'EXAM')) push(byDate, a.date, a);
    for (const [date, list] of byDate) {
      const sorted = list.sort((a, b) => a.startMin - b.startMin);
      let gapTotal = 0;
      const gaps: string[] = [];
      for (let i = 1; i < sorted.length; i++) {
        const gap = sorted[i].startMin - sorted[i - 1].endMin;
        if (gap > 30) {
          gapTotal += gap;
          gaps.push(`${minutesToHHMM(sorted[i - 1].endMin)}–${minutesToHHMM(sorted[i].startMin)} (${(gap / 60).toFixed(1)}h)`);
        }
      }
      if (gapTotal > rules.maxDailyGapHours * 60 && gaps.length > 0) {
        conflicts.push(
          mkConflict(
            'STUDENT_TIMETABLE_GAPS',
            sorted,
            `Student group ${g.code} has ${(gapTotal / 60).toFixed(1)} idle hours on ${date}: gaps at ${gaps.join(', ')}.`,
            `Students wait on campus for long stretches; attendance for later classes typically drops.`,
            [{ level: 1, resource: g.code, description: `${(gapTotal / 60).toFixed(1)}h idle time on ${date}` }],
            sig(['STUDENT_TIMETABLE_GAPS', g.id, date, Math.round(gapTotal)])
          )
        );
      }
    }
  }

  // ---- Room weekly utilization (teaching rooms only; window derived from actual teaching dates)
  const teachingDates = new Set(activities.filter((a) => a.activityType !== 'EVENT').map((a) => a.date));
  const teachingDayCount = Math.max(1, teachingDates.size);
  const weekMinutes = teachingDayCount * (rules.dayEndMin - rules.dayStartMin);
  for (const r of state.rooms) {
    if (r.roomType === 'AUDITORIUM' || r.roomType === 'EVENT_VENUE') continue;
    const used = activities.filter((a) => a.roomId === r.id).reduce((s, a) => s + (a.endMin - a.startMin), 0);
    const util = weekMinutes > 0 ? (used / weekMinutes) * 100 : 0;
    if (util < rules.roomUtilizationThresholdPct) {
      conflicts.push(
        mkConflict(
          'ROOM_UNDERUTILIZATION',
          activities.filter((a) => a.roomId === r.id).slice(0, 5),
          `Room ${r.code} (${r.name}) is only ${util.toFixed(0)}% utilized across the teaching week, below the ${rules.roomUtilizationThresholdPct}% planning threshold.`,
          `Valuable LPU infrastructure sits idle while other rooms face booking pressure.`,
          [{ level: 1, resource: r.code, description: `${util.toFixed(0)}% weekly utilization` }],
          sig(['ROOM_UNDERUTILIZATION', r.id, Math.round(util)]),
          { rooms: [r.code], blocks: [r.blockCode] }
        )
      );
    }
  }

  // ---- Large room underused by small groups (exam venues/auditoriums are designed with spare seating)
  for (const a of activities) {
    if (a.activityType === 'EXAM' || a.activityType === 'EVENT') continue;
    const room = roomById.get(a.roomId);
    if (!room || room.capacity < rules.largeRoomCapacity) continue;
    if (room.roomType === 'EXAM_VENUE' || room.roomType === 'AUDITORIUM' || room.roomType === 'EVENT_VENUE') continue;
    const fill = (a.capacityRequired / room.capacity) * 100;
    if (fill < rules.largeRoomMinFillPct) {
      conflicts.push(
        mkConflict(
          'LARGE_ROOM_UNDERUSED',
          [a],
          `Large venue ${room.code} (${room.capacity} seats) hosts ${a.courseCode} ${a.sectionCode} with only ${a.capacityRequired} students (${fill.toFixed(0)}% fill).`,
          `A big teaching venue is blocked for a small class while large sections compete for it.`,
          [{ level: 1, resource: room.code, description: `${fill.toFixed(0)}% fill of ${room.capacity} seats` }],
          sig(['LARGE_ROOM_UNDERUSED', a.id, room.id, Math.round(fill)])
        )
      );
    }
  }

  // ---- Uneven weekly distribution for sections
  const sectionWeeks = new Map<string, Map<string, number>>();
  for (const a of activities) {
    if (a.activityType === 'EXAM' || a.activityType === 'EVENT') continue;
    const key = `${a.courseCode}|${a.sectionCode}`;
    const days = sectionWeeks.get(key) ?? new Map<string, number>();
    days.set(a.date, (days.get(a.date) ?? 0) + 1);
    sectionWeeks.set(key, days);
  }
  for (const [key, days] of sectionWeeks) {
    if (days.size >= 2) continue;
    const total = Array.from(days.values()).reduce((s, v) => s + v, 0);
    if (total >= 3) {
      const sample = activities.find((a) => `${a.courseCode}|${a.sectionCode}` === key);
      if (!sample) continue;
      conflicts.push(
        mkConflict(
          'UNEVEN_WEEKLY_DISTRIBUTION',
          [sample],
          `All ${total} weekly sessions of ${key} are concentrated on a single day (${Array.from(days.keys()).join(', ')}).`,
          `Students face cognitive overload on one day and no reinforcement later in the week.`,
          [{ level: 1, resource: key, description: `${total} sessions on one day` }],
          sig(['UNEVEN_WEEKLY_DISTRIBUTION', key, total])
        )
      );
    }
  }

  // ---- Faculty preference violations
  for (const f of state.faculty) {
    const acts = activities.filter((a) => a.facultyId === f.id);
    for (const a of acts) {
      if (f.preferences.noEarlyMorning && a.startMin < rules.earlyClassStartMin) {
        conflicts.push(
          mkConflict(
            'FACULTY_PREFERENCE_VIOLATION',
            [a],
            `Faculty ${f.name} prefers no classes before ${minutesToHHMM(rules.earlyClassStartMin)} (preference on file), but ${a.courseCode} ${a.sectionCode} starts at ${minutesToHHMM(a.startMin)} on ${a.date}.`,
            `Faculty preference violated — recurring adjustment requests likely.`,
            [{ level: 1, resource: f.name, description: `Early-morning preference violated` }],
            sig(['FAC_PREF_EARLY', f.id, a.id])
          )
        );
        break;
      }
      if (f.preferences.noLateEvening && a.endMin > rules.lateClassEndMin) {
        conflicts.push(
          mkConflict(
            'FACULTY_PREFERENCE_VIOLATION',
            [a],
            `Faculty ${f.name} prefers no classes after ${minutesToHHMM(rules.lateClassEndMin)}, but ${a.courseCode} ${a.sectionCode} runs until ${minutesToHHMM(a.endMin)} on ${a.date}.`,
            `Faculty preference violated — evening commute constraints.`,
            [{ level: 1, resource: f.name, description: `Late-evening preference violated` }],
            sig(['FAC_PREF_LATE', f.id, a.id])
          )
        );
        break;
      }
    }
  }

  // ---- Student preference (too early / too late)
  for (const g of state.studentGroups) {
    const acts = activities.filter((a) => a.studentGroupId === g.id && a.activityType !== 'EVENT');
    const early = acts.find((a) => a.startMin < rules.earlyClassStartMin);
    const late = acts.find((a) => a.endMin > rules.lateClassEndMin);
    if (early) {
      conflicts.push(
        mkConflict(
          'STUDENT_PREFERENCE_VIOLATION',
          [early],
          `Student group ${g.code} has classes starting before ${minutesToHHMM(rules.earlyClassStartMin)} (e.g. ${early.courseCode} at ${minutesToHHMM(early.startMin)} on ${early.date}) — hostel shuttles and attendance suffer.`,
          `Early classes show systematically lower attendance for resident students.`,
          [{ level: 1, resource: g.code, description: 'Early-morning classes scheduled' }],
          sig(['STU_PREF_EARLY', g.id])
        )
      );
    }
    if (late) {
      conflicts.push(
        mkConflict(
          'STUDENT_PREFERENCE_VIOLATION',
          [late],
          `Student group ${g.code} has classes ending after ${minutesToHHMM(rules.lateClassEndMin)} (e.g. ${late.courseCode} until ${minutesToHHMM(late.endMin)} on ${late.date}).`,
          `Late classes conflict with mess timings, sports and shuttle schedules.`,
          [{ level: 1, resource: g.code, description: 'Late-evening classes scheduled' }],
          sig(['STU_PREF_LATE', g.id])
        )
      );
    }
  }

  // ---- Excessive block movement for groups (per day)
  for (const g of state.studentGroups) {
    const byDate = new Map<string, EngineActivity[]>();
    for (const a of activities.filter((x) => x.studentGroupId === g.id)) push(byDate, a.date, a);
    for (const [date, list] of byDate) {
      const sorted = list.sort((a, b) => a.startMin - b.startMin);
      let moves = 0;
      const hops: string[] = [];
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].blockId !== sorted[i - 1].blockId) {
          moves++;
          hops.push(`${sorted[i - 1].blockCode}→${sorted[i].blockCode}`);
        }
      }
      if (moves > rules.maxBlockMovesPerDay) {
        conflicts.push(
          mkConflict(
            'EXCESSIVE_BLOCK_MOVEMENT',
            sorted,
            `Student group ${g.code} changes academic blocks ${moves} times on ${date} (${hops.join(', ')}), above the ${rules.maxBlockMovesPerDay}-move comfort limit.`,
            `Students lose transit time and arrive late to subsequent classes.`,
            [{ level: 1, resource: g.code, description: `${moves} block moves on ${date}` }],
            sig(['EXCESSIVE_BLOCK_MOVEMENT', g.id, date, moves])
          )
        );
      }
    }
  }

  return conflicts;
}

// ------------------------------------------------------------------ analytics helpers (engine-side, deterministic)

export function facultyWeeklyHours(state: ScheduleState): Array<{ facultyId: string; name: string; schoolCode: string; hours: number; max: number }> {
  const map = new Map<string, number>();
  for (const a of state.activities) {
    if (a.status === 'CANCELLED') continue;
    map.set(a.facultyId, (map.get(a.facultyId) ?? 0) + (a.endMin - a.startMin) / 60);
  }
  return state.faculty.map((f) => ({
    facultyId: f.id,
    name: f.name,
    schoolCode: f.schoolCode,
    hours: Math.round((map.get(f.id) ?? 0) * 10) / 10,
    max: f.maxWeeklyHours,
  }));
}

export function roomUtilization(state: ScheduleState, rules: SchedulingRuleConfig): Array<{ roomId: string; code: string; roomType: string; blockCode: string; capacity: number; usedPct: number; hours: number }> {
  const weekMinutes = 6 * (rules.dayEndMin - rules.dayStartMin);
  const map = new Map<string, number>();
  for (const a of state.activities) {
    if (a.status === 'CANCELLED') continue;
    map.set(a.roomId, (map.get(a.roomId) ?? 0) + (a.endMin - a.startMin));
  }
  return state.rooms.map((r) => {
    const used = map.get(r.id) ?? 0;
    return {
      roomId: r.id,
      code: r.code,
      roomType: r.roomType,
      blockCode: r.blockCode,
      capacity: r.capacity,
      hours: Math.round((used / 60) * 10) / 10,
      usedPct: weekMinutes > 0 ? Math.round((used / weekMinutes) * 100) : 0,
    };
  });
}

export { activityLabel };
