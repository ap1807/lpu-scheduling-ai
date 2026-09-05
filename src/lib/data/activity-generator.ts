/**
 * LPU schedule generator — builds a realistic two-week teaching timetable
 * (theory + labs + tutorials + seminars + exams + university events) with a
 * greedy constraint-respecting placement loop, then injects a set of
 * DELIBERATE conflicts for demonstration, including the golden-path demo:
 * two sections double-booked into B24-105 at the same date & time.
 */
import { EngineActivity } from '@/lib/engine/types';
import { addDays, dayOfWeek, weekStart } from '@/lib/engine/util';
import { COURSES, FACULTY, ROOMS, STUDENT_GROUPS } from './reference-data';

export interface GeneratedActivity {
  groupCode: string;
  courseCode: string;
  sectionCode: string;
  activityType: 'CLASS' | 'TUTORIAL' | 'LAB' | 'WORKSHOP' | 'SEMINAR' | 'EXAM' | 'EVENT' | 'OTHER';
  date: string;
  startMin: number;
  endMin: number;
  roomCode: string;
  facultyCode: string;
  capacityRequired: number;
  courseName: string;
  notes?: string;
  isDemoConflict: boolean;
}

const THEORY_SLOTS = [540, 600, 660, 870, 930, 990]; // 9:00,10:00,11:00,14:30,15:30,16:30
const LAB_SLOTS = [540, 660, 870, 990];              // 9-11, 11-13, 14:30-16:30, 16:30-18:30

const THEORY_ROOM_POOLS: Record<string, string[]> = {
  SCSE: ['B24-101', 'B24-102', 'B24-103', 'B24-104', 'B24-106', 'B24-107', 'B24-108', 'B24-201', 'B24-202', 'B24-203', 'B24-204', 'B24-105'],
  SEEE: ['B26-101', 'B26-102', 'B26-201', 'B26-202'],
  SME: ['B27-101', 'B27-102'],
  SOM: ['B31-101', 'B31-102', 'B31-103'],
  SOHM: ['B41-101', 'B41-102'],
  SBAS: ['B32-101', 'B32-102'],
};

const LAB_ROOM_POOLS: Record<string, string[]> = {
  SCSE: ['B25-L1', 'B25-L2', 'B25-L4', 'B25-L5', 'B25-L3'],
  SEEE: ['B26-L1', 'B26-L2', 'B26-L3'],
  SME: ['B27-L1', 'B27-L2'],
  SOHM: ['B41-T1'],
  SBAS: ['B32-L1', 'B32-L2'],
};

interface SessionPlan { course: string; kind: 'T' | 'L'; count: number }

const GROUP_PLANS: Array<{ group: string; plan: SessionPlan[] }> = [
  { group: 'CSE23-A', plan: [
    { course: 'CSE301', kind: 'T', count: 2 }, { course: 'CSE301', kind: 'L', count: 1 },
    { course: 'CSE302', kind: 'T', count: 2 }, { course: 'CSE303', kind: 'T', count: 2 }, { course: 'CSE303', kind: 'L', count: 1 },
    { course: 'CSE304', kind: 'T', count: 2 }, { course: 'CSE305', kind: 'T', count: 2 },
    { course: 'CSE307', kind: 'T', count: 1 },
  ] },
  { group: 'CSE23-B', plan: [
    { course: 'CSE301', kind: 'T', count: 2 }, { course: 'CSE301', kind: 'L', count: 1 },
    { course: 'CSE302', kind: 'T', count: 2 }, { course: 'CSE303', kind: 'T', count: 2 }, { course: 'CSE303', kind: 'L', count: 1 },
    { course: 'CSE304', kind: 'T', count: 2 }, { course: 'CSE305', kind: 'T', count: 2 },
  ] },
  { group: 'CSE23-C', plan: [
    { course: 'CSE301', kind: 'T', count: 2 }, { course: 'CSE301', kind: 'L', count: 1 },
    { course: 'CSE302', kind: 'T', count: 2 }, { course: 'CSE303', kind: 'T', count: 2 }, { course: 'CSE303', kind: 'L', count: 1 },
    { course: 'CSE304', kind: 'T', count: 2 }, { course: 'CSE305', kind: 'T', count: 2 },
  ] },
  { group: 'CSE23-AB', plan: [
    { course: 'CSE305', kind: 'T', count: 2 }, { course: 'CSE304', kind: 'T', count: 1 },
  ] },
  { group: 'CSE24-A', plan: [
    { course: 'CSE201', kind: 'T', count: 2 }, { course: 'CSE201', kind: 'L', count: 1 },
    { course: 'CSE202', kind: 'T', count: 2 }, { course: 'CSE202', kind: 'L', count: 1 },
    { course: 'CSE203', kind: 'T', count: 2 },
    { course: 'CSE204', kind: 'T', count: 2 }, { course: 'CSE204', kind: 'L', count: 1 },
  ] },
  { group: 'CSE24-B', plan: [
    { course: 'CSE201', kind: 'T', count: 2 }, { course: 'CSE201', kind: 'L', count: 1 },
    { course: 'CSE202', kind: 'T', count: 2 }, { course: 'CSE202', kind: 'L', count: 1 },
    { course: 'CSE203', kind: 'T', count: 2 },
    { course: 'CSE204', kind: 'T', count: 2 }, { course: 'CSE204', kind: 'L', count: 1 },
  ] },
  { group: 'CSE24-C', plan: [
    { course: 'CSE201', kind: 'T', count: 2 }, { course: 'CSE201', kind: 'L', count: 1 },
    { course: 'CSE202', kind: 'T', count: 2 }, { course: 'CSE202', kind: 'L', count: 1 },
    { course: 'CSE203', kind: 'T', count: 2 },
    { course: 'CSE204', kind: 'T', count: 2 }, { course: 'CSE204', kind: 'L', count: 1 },
  ] },
  { group: 'ECE23-A', plan: [
    { course: 'ECE301', kind: 'T', count: 2 }, { course: 'ECE302', kind: 'T', count: 2 }, { course: 'ECE302', kind: 'L', count: 1 },
    { course: 'ECE303', kind: 'T', count: 2 }, { course: 'ECE304', kind: 'T', count: 2 },
  ] },
  { group: 'ECE23-B', plan: [
    { course: 'ECE301', kind: 'T', count: 2 }, { course: 'ECE302', kind: 'T', count: 2 }, { course: 'ECE302', kind: 'L', count: 1 },
    { course: 'ECE303', kind: 'T', count: 2 }, { course: 'ECE304', kind: 'T', count: 2 },
  ] },
  { group: 'ME23-A', plan: [
    { course: 'ME301', kind: 'T', count: 2 }, { course: 'ME302', kind: 'T', count: 2 }, { course: 'ME303', kind: 'L', count: 2 },
  ] },
  { group: 'ME23-B', plan: [
    { course: 'ME301', kind: 'T', count: 2 }, { course: 'ME302', kind: 'T', count: 2 }, { course: 'ME303', kind: 'L', count: 2 },
  ] },
  { group: 'MBA25-A', plan: [
    { course: 'MGT101', kind: 'T', count: 2 }, { course: 'MGT102', kind: 'T', count: 2 },
    { course: 'MGT103', kind: 'T', count: 2 }, { course: 'MGT104', kind: 'T', count: 2 },
  ] },
  { group: 'MBA25-B', plan: [
    { course: 'MGT101', kind: 'T', count: 2 }, { course: 'MGT102', kind: 'T', count: 2 },
    { course: 'MGT103', kind: 'T', count: 2 }, { course: 'MGT104', kind: 'T', count: 2 },
  ] },
  { group: 'HM24-A', plan: [
    { course: 'HM201', kind: 'T', count: 1 }, { course: 'HM201', kind: 'L', count: 2 },
    { course: 'HM202', kind: 'T', count: 3 },
    { course: 'HM203', kind: 'T', count: 1 },
  ] },
  { group: 'BIO23-A', plan: [
    { course: 'BIO301', kind: 'T', count: 2 }, { course: 'BIO302', kind: 'T', count: 1 }, { course: 'BIO302', kind: 'L', count: 2 },
    { course: 'BIO303', kind: 'T', count: 2 },
  ] },
];

interface ForcedSession {
  group: string; course: string; type: GeneratedActivity['activityType'];
  dateOffset: number; startMin: number; endMin: number;
  roomCode: string; facultyCode: string; demo?: boolean; notes?: string;
  capacityRequired?: number; kind: 'T' | 'L' | 'X';
}

/** All deliberate placements (pre-greedy so the generator schedules around them). */
const FORCED: ForcedSession[] = [
  // ============ GOLDEN DEMO — double-booked room B24-105 ============
  { group: 'CSE23-A', course: 'CSE301', type: 'CLASS', kind: 'T', dateOffset: 7, startMin: 600, endMin: 660, roomCode: 'B24-105', facultyCode: 'FAC-101', demo: true, notes: 'Entered by Timetable Cell during Friday rush — room column pasted from CSE302-B row' },
  { group: 'CSE23-B', course: 'CSE302', type: 'CLASS', kind: 'T', dateOffset: 7, startMin: 600, endMin: 660, roomCode: 'B24-105', facultyCode: 'FAC-104', demo: true, notes: 'Copy-paste error from spreadsheet import' },
  // ============ Combined-section lectures (CSE23-AB) ============
  { group: 'CSE23-AB', course: 'CSE305', type: 'CLASS', kind: 'T', dateOffset: 0, startMin: 870, endMin: 930, roomCode: 'B24-105', facultyCode: 'FAC-102' },
  { group: 'CSE23-AB', course: 'CSE305', type: 'CLASS', kind: 'T', dateOffset: 2, startMin: 870, endMin: 930, roomCode: 'B24-105', facultyCode: 'FAC-102' },
  { group: 'CSE23-AB', course: 'CSE304', type: 'CLASS', kind: 'T', dateOffset: 4, startMin: 870, endMin: 930, roomCode: 'B24-203', facultyCode: 'FAC-106', demo: true, notes: 'Combined lecture booked into a 72-seat room (142 students expected)' },
  // ============ CSE23-A Wednesday zig-zag (block movement demo) ============
  { group: 'CSE23-A', course: 'CSE304', type: 'CLASS', kind: 'T', dateOffset: 2, startMin: 540, endMin: 600, roomCode: 'B24-101', facultyCode: 'FAC-106' },
  { group: 'CSE23-A', course: 'CSE301', type: 'LAB', kind: 'L', dateOffset: 2, startMin: 600, endMin: 720, roomCode: 'B25-L1', facultyCode: 'FAC-101' },
  { group: 'CSE23-A', course: 'CSE307', type: 'CLASS', kind: 'T', dateOffset: 2, startMin: 870, endMin: 930, roomCode: 'B26-202', facultyCode: 'FAC-108' },
  { group: 'CSE23-A', course: 'CSE305', type: 'CLASS', kind: 'T', dateOffset: 2, startMin: 930, endMin: 990, roomCode: 'B24-106', facultyCode: 'FAC-102' },
  { group: 'CSE23-A', course: 'CSE303', type: 'LAB', kind: 'L', dateOffset: 2, startMin: 990, endMin: 1050, roomCode: 'B25-L5', facultyCode: 'FAC-103' },
  // ============ Room unavailable (B25-L3 Mon morning maintenance) ============
  { group: 'CSE23-B', course: 'CSE303', type: 'LAB', kind: 'L', dateOffset: 0, startMin: 540, endMin: 660, roomCode: 'B25-L3', facultyCode: 'FAC-103', demo: true, notes: 'Lab slot booked before maintenance calendar was published' },
  // ============ Faculty unavailable Thursday (FAC-104 at IEEE conference) ============
  { group: 'CSE23-A', course: 'CSE302', type: 'CLASS', kind: 'T', dateOffset: 3, startMin: 870, endMin: 930, roomCode: 'B24-101', facultyCode: 'FAC-104', demo: true, notes: 'Scheduled despite leave record on file' },
  // ============ Faculty double-booking (FAC-103, Tue 11:00) ============
  { group: 'CSE23-A', course: 'CSE303', type: 'CLASS', kind: 'T', dateOffset: 1, startMin: 660, endMin: 720, roomCode: 'B24-101', facultyCode: 'FAC-103', demo: true, notes: 'Two sections assigned in one pass' },
  { group: 'CSE23-C', course: 'CSE303', type: 'CLASS', kind: 'T', dateOffset: 1, startMin: 660, endMin: 720, roomCode: 'B24-103', facultyCode: 'FAC-103', demo: true, notes: 'Two sections assigned in one pass' },
  // ============ Duplicate booking base (CSE24-A CSE201, Tue 10:00) ============
  { group: 'CSE24-A', course: 'CSE201', type: 'CLASS', kind: 'T', dateOffset: 1, startMin: 600, endMin: 660, roomCode: 'B24-101', facultyCode: 'FAC-105', demo: true, notes: 'Original entry' },
  // ============ HM24-A Monday gap (idle hours) ============
  { group: 'HM24-A', course: 'HM201', type: 'CLASS', kind: 'T', dateOffset: 0, startMin: 540, endMin: 600, roomCode: 'B41-101', facultyCode: 'FAC-501' },
  { group: 'HM24-A', course: 'HM203', type: 'CLASS', kind: 'T', dateOffset: 0, startMin: 930, endMin: 990, roomCode: 'B41-102', facultyCode: 'FAC-503' },
  // ============ HM24-A Tuesday — all HM202 hours clumped (uneven) ============
  { group: 'HM24-A', course: 'HM202', type: 'CLASS', kind: 'T', dateOffset: 1, startMin: 540, endMin: 600, roomCode: 'B41-101', facultyCode: 'FAC-502' },
  { group: 'HM24-A', course: 'HM202', type: 'CLASS', kind: 'T', dateOffset: 1, startMin: 600, endMin: 660, roomCode: 'B41-101', facultyCode: 'FAC-502' },
  { group: 'HM24-A', course: 'HM202', type: 'CLASS', kind: 'T', dateOffset: 1, startMin: 870, endMin: 930, roomCode: 'B41-102', facultyCode: 'FAC-502' },
  // ============ FAC-105 triple chain Thursday (back-to-back) ============
  { group: 'CSE24-A', course: 'CSE202', type: 'CLASS', kind: 'T', dateOffset: 3, startMin: 540, endMin: 600, roomCode: 'B24-106', facultyCode: 'FAC-105' },
  { group: 'CSE24-B', course: 'CSE201', type: 'CLASS', kind: 'T', dateOffset: 3, startMin: 600, endMin: 660, roomCode: 'B24-107', facultyCode: 'FAC-105' },
  { group: 'CSE24-B', course: 'CSE202', type: 'CLASS', kind: 'T', dateOffset: 3, startMin: 660, endMin: 720, roomCode: 'B24-108', facultyCode: 'FAC-105' },
  // ============ Early class Monday (CSE204-A 08:00 — preference violations) ============
  { group: 'CSE24-A', course: 'CSE204', type: 'CLASS', kind: 'T', dateOffset: 0, startMin: 480, endMin: 540, roomCode: 'B24-104', facultyCode: 'FAC-109', demo: true, notes: '08:00 section added due to room crunch' },
  // ============ Late class Thursday (CSE304-B 17:30 — faculty preference) ============
  { group: 'CSE23-B', course: 'CSE304', type: 'CLASS', kind: 'T', dateOffset: 3, startMin: 1065, endMin: 1125, roomCode: 'B24-102', facultyCode: 'FAC-106', demo: true, notes: 'Evening slot assigned to balance weekly hours' },
  // ============ Lab booked in classroom (CSE303-C practical, week 2 Wed) ============
  { group: 'CSE23-C', course: 'CSE303', type: 'LAB', kind: 'L', dateOffset: 9, startMin: 870, endMin: 990, roomCode: 'B24-108', facultyCode: 'FAC-103', demo: true, notes: 'Networks practical moved into a lecture room after lab fire-alarm' },
  // ============ MBA25-B student group overlap (Tue 11:00, two rooms) ============
  { group: 'MBA25-B', course: 'MGT102', type: 'CLASS', kind: 'T', dateOffset: 1, startMin: 660, endMin: 720, roomCode: 'B31-101', facultyCode: 'FAC-402', demo: true, notes: 'Finance class scheduled against marketing class' },
  { group: 'MBA25-B', course: 'MGT103', type: 'CLASS', kind: 'T', dateOffset: 1, startMin: 660, endMin: 720, roomCode: 'B31-102', facultyCode: 'FAC-404', demo: true, notes: 'Finance class scheduled against marketing class' },
  // ============ Small class in a big hall (B24-105, Fri 15:30) ============
  { group: 'BIO23-A', course: 'BIO301', type: 'CLASS', kind: 'T', dateOffset: 4, startMin: 930, endMin: 990, roomCode: 'B24-105', facultyCode: 'FAC-601', demo: true, notes: 'Only free room at the time' },
  // ============ Seminar & workshop (realistic activity mix) ============
  { group: 'MBA25-A', course: 'MGT103', type: 'SEMINAR', kind: 'T', dateOffset: 2, startMin: 660, endMin: 780, roomCode: 'B31-L1', facultyCode: 'FAC-404' },
  { group: 'CSE23-AB', course: 'CSE301', type: 'WORKSHOP', kind: 'X', dateOffset: 5, startMin: 870, endMin: 1050, roomCode: 'B24-105', facultyCode: 'FAC-109', notes: 'Cloud Computing Workshop (AWS Educate)', capacityRequired: 142 },
];

/** Post-greedy inserts: deliberate rule violations + exams + events. */
const POST: ForcedSession[] = [
  // Duplicate double-entry of the CSE24-A CSE201 Tuesday record
  { group: 'CSE24-A', course: 'CSE201', type: 'CLASS', kind: 'X', dateOffset: 1, startMin: 600, endMin: 660, roomCode: 'B24-101', facultyCode: 'FAC-105', demo: true, notes: 'Duplicate row from re-import' },
  // Invalid time (19:30–20:30, outside teaching window)
  { group: 'BIO23-A', course: 'BIO303', type: 'CLASS', kind: 'X', dateOffset: 5, startMin: 1170, endMin: 1230, roomCode: 'B32-101', facultyCode: 'FAC-603', demo: true, notes: 'Evening slot keyed as 19:30 instead of 16:30' },
  // ============ Mid-term examinations (week 2, Thu–Sat) ============
  { group: 'CSE23-A', course: 'CSE301', type: 'EXAM', kind: 'X', dateOffset: 10, startMin: 540, endMin: 720, roomCode: 'B38-H1', facultyCode: 'FAC-101' },
  { group: 'CSE23-A', course: 'CSE303', type: 'EXAM', kind: 'X', dateOffset: 10, startMin: 540, endMin: 720, roomCode: 'B38-H2', facultyCode: 'FAC-103', demo: true, notes: 'Both Sem-5 papers timetabled into the same morning' },
  { group: 'CSE23-B', course: 'CSE301', type: 'EXAM', kind: 'X', dateOffset: 10, startMin: 840, endMin: 1020, roomCode: 'B38-H3', facultyCode: 'FAC-101' },
  { group: 'CSE23-C', course: 'CSE301', type: 'EXAM', kind: 'X', dateOffset: 10, startMin: 840, endMin: 1020, roomCode: 'B38-H4', facultyCode: 'FAC-109' },
  { group: 'CSE23-B', course: 'CSE302', type: 'EXAM', kind: 'X', dateOffset: 11, startMin: 540, endMin: 720, roomCode: 'B38-H1', facultyCode: 'FAC-104' },
  { group: 'CSE23-C', course: 'CSE303', type: 'EXAM', kind: 'X', dateOffset: 11, startMin: 540, endMin: 720, roomCode: 'B38-H2', facultyCode: 'FAC-103' },
  { group: 'CSE24-A', course: 'CSE201', type: 'EXAM', kind: 'X', dateOffset: 11, startMin: 840, endMin: 1020, roomCode: 'B38-H3', facultyCode: 'FAC-105' },
  { group: 'CSE24-B', course: 'CSE201', type: 'EXAM', kind: 'X', dateOffset: 11, startMin: 840, endMin: 1020, roomCode: 'B38-H4', facultyCode: 'FAC-107' },
  { group: 'CSE24-C', course: 'CSE201', type: 'EXAM', kind: 'X', dateOffset: 11, startMin: 840, endMin: 1020, roomCode: 'B38-H1', facultyCode: 'FAC-109' },
  { group: 'MBA25-A', course: 'MGT101', type: 'EXAM', kind: 'X', dateOffset: 11, startMin: 540, endMin: 660, roomCode: 'B31-102', facultyCode: 'FAC-401', demo: true, notes: 'Exam booked into a normal case room' },
  { group: 'MBA25-B', course: 'MGT101', type: 'EXAM', kind: 'X', dateOffset: 11, startMin: 540, endMin: 660, roomCode: 'B38-H4', facultyCode: 'FAC-402' },
  { group: 'HM24-A', course: 'HM201', type: 'EXAM', kind: 'X', dateOffset: 12, startMin: 540, endMin: 720, roomCode: 'B38-H3', facultyCode: 'FAC-501' },
  { group: 'BIO23-A', course: 'BIO301', type: 'EXAM', kind: 'X', dateOffset: 12, startMin: 540, endMin: 720, roomCode: 'B38-H4', facultyCode: 'FAC-601' },
];

/** University events (group UNIV). */
const EVENTS: ForcedSession[] = [
  { group: 'UNIV', course: 'EVT101', type: 'EVENT', kind: 'X', dateOffset: 6, startMin: 540, endMin: 1020, roomCode: 'B38-SDA', facultyCode: 'FAC-101', capacityRequired: 800, notes: 'TechSrijan 2026 — National Hackathon (Day 1)' },
  { group: 'UNIV', course: 'EVT102', type: 'EVENT', kind: 'X', dateOffset: 5, startMin: 540, endMin: 780, roomCode: 'B38-SDA', facultyCode: 'FAC-401', capacityRequired: 1000, notes: 'Placement Drive — TCS NQT Aptitude Test' },
  { group: 'UNIV', course: 'EVT103', type: 'EVENT', kind: 'X', dateOffset: 2, startMin: 870, endMin: 1050, roomCode: 'B31-L1', facultyCode: 'FAC-402', capacityRequired: 60, notes: 'Faculty Development Programme: AI in Education' },
  { group: 'UNIV', course: 'EVT104', type: 'EVENT', kind: 'X', dateOffset: 11, startMin: 990, endMin: 1170, roomCode: 'B38-SDA', facultyCode: 'FAC-106', capacityRequired: 900, notes: 'Ullas Youth Festival — Curtain Raiser Evening' },
];

const EVENT_COURSES: Record<string, string> = {
  EVT101: 'TechSrijan 2026 — National Hackathon',
  EVT102: 'Placement Drive — TCS NQT',
  EVT103: 'Faculty Development Programme',
  EVT104: 'Ullas Youth Festival',
};

const roomByCode = new Map(ROOMS.map((r) => [r.code, r]));
const facultyByCode = new Map(FACULTY.map((f) => [f.code, f]));
const courseByCode = new Map(COURSES.map((c) => [c.code, c]));
const groupByCode = new Map(STUDENT_GROUPS.map((g) => [g.code, g]));

interface Cell { key: string; ranges: Array<[number, number]> }
class Occupancy {
  private map = new Map<string, Array<[number, number]>>();
  isFree(id: string, date: string, startMin: number, endMin: number): boolean {
    const arr = this.map.get(`${id}|${date}`);
    if (!arr) return true;
    return !arr.some(([s, e]) => startMin < e && s < endMin);
  }
  mark(id: string, date: string, startMin: number, endMin: number) {
    const key = `${id}|${date}`;
    const arr = this.map.get(key) ?? [];
    arr.push([startMin, endMin]);
    this.map.set(key, arr);
  }
}

function sectionCodeFor(groupCode: string, courseCode: string): string {
  const g = groupByCode.get(groupCode);
  return `${courseCode}-${g?.section ?? 'X'}`;
}

function mkActivity(
  groupCode: string, courseCode: string, type: GeneratedActivity['activityType'],
  date: string, startMin: number, endMin: number, roomCode: string, facultyCode: string,
  opts: { demo?: boolean; notes?: string; capacityRequired?: number } = {}
): GeneratedActivity {
  const room = roomByCode.get(roomCode);
  const faculty = facultyByCode.get(facultyCode);
  const group = groupByCode.get(groupCode);
  const course = courseByCode.get(courseCode);
  const courseName =
    course?.name ??
    EVENT_COURSES[courseCode] ??
    courseCode;
  return {
    groupCode,
    courseCode,
    sectionCode: sectionCodeFor(groupCode, courseCode),
    activityType: type,
    date,
    startMin,
    endMin,
    roomCode,
    facultyCode,
    capacityRequired: opts.capacityRequired ?? group?.size ?? 60,
    courseName,
    notes: opts.notes ?? (room && faculty ? undefined : undefined),
    isDemoConflict: opts.demo ?? false,
  };
}

/**
 * Generate the complete two-week LPU schedule.
 * week1Monday = ISO Monday of the current week; window spans 14 days.
 */
export function generateSchedule(week1Monday?: string): { activities: GeneratedActivity[]; window: { start: string; end: string; monday: string } } {
  const monday = week1Monday ?? weekStart(new Date().toISOString().slice(0, 10));
  const dateFor = (offset: number) => addDays(monday, offset);

  // Teaching days: week 1 Mon-Sat (offsets 0-5), week 2 Mon-Wed (7-9). Exams Thu-Sat week 2.
  const teachingOffsets = [0, 1, 2, 3, 4, 5, 7, 8, 9];
  const dowFor = (offset: number) => dayOfWeek(dateFor(offset));

  const roomOcc = new Occupancy();
  const facOcc = new Occupancy();
  const groupOcc = new Occupancy();
  const out: GeneratedActivity[] = [];

  // Room unavailability map (from reference data)
  const roomUnavailable = (roomCode: string, date: string, s: number, e: number): boolean => {
    const room = roomByCode.get(roomCode);
    if (!room) return false;
    const day = dayOfWeek(date);
    return room.unavailable.some((u) => u.day === day && s < u.endMin && u.startMin < e);
  };
  const facultyUnavailable = (facultyCode: string, date: string, s: number, e: number): boolean => {
    const f = facultyByCode.get(facultyCode);
    if (!f) return false;
    const day = dayOfWeek(date);
    return f.unavailable.some((u) => u.day === day && s < u.endMin && u.startMin < e);
  };

  const place = (act: GeneratedActivity) => {
    const room = roomByCode.get(act.roomCode);
    const faculty = facultyByCode.get(act.facultyCode);
    if (room) roomOcc.mark(room.id, act.date, act.startMin, act.endMin);
    if (faculty) facOcc.mark(faculty.id, act.date, act.startMin, act.endMin);
    if (act.groupCode !== 'UNIV') groupOcc.mark(act.groupCode, act.date, act.startMin, act.endMin);
  };

  // ---------- 1. forced sessions + events (register first) ----------
  for (const f of [...FORCED, ...EVENTS]) {
    const act = mkActivity(f.group, f.course, f.type, dateFor(f.dateOffset), f.startMin, f.endMin, f.roomCode, f.facultyCode, { demo: f.demo, notes: f.notes, capacityRequired: f.capacityRequired });
    out.push(act);
    place(act);
  }

  // Count forced sessions per (group, course, kind)
  const forcedCount = new Map<string, number>();
  for (const f of FORCED) {
    if (f.kind === 'X') continue;
    const key = `${f.group}|${f.course}|${f.kind}`;
    forcedCount.set(key, (forcedCount.get(key) ?? 0) + 1);
  }

  // ---------- 2. greedy generation of remaining sessions ----------
  let groupIndex = 0;
  for (const gp of GROUP_PLANS) {
    const group = groupByCode.get(gp.group);
    if (!group) continue;
    const startDay = groupIndex * 2;

    for (const sp of gp.plan) {
      const course = courseByCode.get(sp.course);
      if (!course) continue;
      const primary = course.faculty[0];
      const backup = course.faculty[1] ?? course.faculty[0];
      const placed = forcedCount.get(`${gp.group}|${sp.course}|${sp.kind}`) ?? 0;
      const remaining = Math.max(0, sp.count - placed);

      for (let i = 0; i < remaining; i++) {
        let done = false;
      // iterate days starting from rotating offset
      for (let d = 0; d < teachingOffsets.length && !done; d++) {
        const offset = teachingOffsets[(startDay + d) % teachingOffsets.length];
        const date = dateFor(offset);
        const slots = sp.kind === 'L' ? LAB_SLOTS : THEORY_SLOTS;
        const duration = sp.kind === 'L' ? 120 : 60;

        // per-day session cap (5)
        const thatDay = out.filter((a) => a.groupCode === gp.group && a.date === date).length;
        if (thatDay >= 5) continue;

        for (const slot of slots) {
          const end = slot + duration;
          if (end > 1140) continue;
          if (!groupOcc.isFree(gp.group, date, slot, end)) continue;

          // faculty: primary then backup
          for (const facCode of [primary, backup]) {
            if (facOcc.isFree(facCode, date, slot, end) && !facultyUnavailable(facCode, date, slot, end)) {
              // room pool — rotate start index so usage spreads across rooms
              const schoolCode = course.schoolId;
              const pool = sp.kind === 'L' ? (LAB_ROOM_POOLS[schoolCode] ?? []) : (THEORY_ROOM_POOLS[schoolCode] ?? []);
              const roomStart = (groupIndex * 3 + i * 2 + d) % Math.max(1, pool.length);
              for (let ri = 0; ri < pool.length; ri++) {
                const rc = pool[(roomStart + ri) % pool.length];
                const room = roomByCode.get(rc);
                if (!room || room.capacity < group.size) continue;
                if (!roomOcc.isFree(room.id, date, slot, end)) continue;
                if (roomUnavailable(rc, date, slot, end)) continue;
                const act = mkActivity(gp.group, sp.course, sp.kind === 'L' ? 'LAB' : 'CLASS', date, slot, end, rc, facCode);
                out.push(act);
                place(act);
                done = true;
                break;
              }
              if (done) break;
            }
          }
          if (done) break;
        }
      }
        // If still not placed, skip quietly (schedule window saturated)
      }
    }
    groupIndex++;
  }

  // ---------- 3. post inserts (violations + exams) ----------
  for (const p of POST) {
    out.push(mkActivity(p.group, p.course, p.type, dateFor(p.dateOffset), p.startMin, p.endMin, p.roomCode, p.facultyCode, { demo: p.demo, notes: p.notes, capacityRequired: p.capacityRequired }));
  }

  return {
    activities: out,
    window: { start: dateFor(0), end: dateFor(13), monday },
  };
}
