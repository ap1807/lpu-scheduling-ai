/**
 * LPU Scheduling Engine — Core Domain Types
 * ------------------------------------------
 * Pure TypeScript domain model. This module (and the whole `engine/` folder)
 * has ZERO dependencies on the database, the AI layer, or Next.js.
 * The engine is the deterministic source of truth for:
 *   - whether a conflict exists
 *   - whether a proposed change is valid
 */

// ---------------------------------------------------------------- Roles
export type Role = 'ADMIN' | 'SCHEDULER' | 'FACULTY' | 'STUDENT';

// ---------------------------------------------------------------- Enums
export type ActivityType =
  | 'CLASS'
  | 'TUTORIAL'
  | 'LAB'
  | 'WORKSHOP'
  | 'SEMINAR'
  | 'EXAM'
  | 'EVENT'
  | 'OTHER';

export type RoomType =
  | 'CLASSROOM'
  | 'LABORATORY'
  | 'EXAM_VENUE'
  | 'AUDITORIUM'
  | 'SEMINAR_HALL'
  | 'EVENT_VENUE';

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type ConflictCategory = 'HARD' | 'SOFT';

export type ConflictType =
  // ---- Hard conflicts (schedule is impossible / rule violated) ----
  | 'ROOM_TIME_OVERLAP'          // two activities, same room, overlapping time
  | 'FACULTY_TIME_OVERLAP'       // same faculty, overlapping time
  | 'ROOM_CAPACITY_INSUFFICIENT' // room smaller than required capacity
  | 'ROOM_TYPE_MISMATCH'         // wrong room type (e.g. lab course in classroom)
  | 'EXAM_VENUE_INCOMPATIBLE'    // exam not in an approved examination venue
  | 'FACULTY_UNAVAILABLE'        // activity during faculty unavailable window
  | 'ROOM_UNAVAILABLE'           // activity during room unavailable window
  | 'DUPLICATE_ACTIVITY'         // same section/activity booked twice
  | 'INVALID_TIME'               // end <= start or outside allowed slots
  | 'RESOURCE_MISSING'           // room/faculty/group referenced but not found
  | 'STUDENT_GROUP_OVERLAP'      // same student group, overlapping time
  | 'EXAM_GROUP_OVERLAP'         // same student group, two exams overlapping
  // ---- Soft conflicts (schedule works, but quality suffers) ----
  | 'FACULTY_OVERLOAD'           // weekly hours above policy max
  | 'FACULTY_BACK_TO_BACK'       // too many consecutive sessions without break
  | 'STUDENT_TIMETABLE_GAPS'     // excessive idle gaps in a group's day
  | 'ROOM_UNDERUTILIZATION'      // room usage below threshold
  | 'UNEVEN_WEEKLY_DISTRIBUTION' // a section's weekly classes clumped on few days
  | 'FACULTY_PREFERENCE_VIOLATION'
  | 'STUDENT_PREFERENCE_VIOLATION' // too-early / too-late classes
  | 'INCONVENIENT_TIMING'        // classes outside preferred teaching hours
  | 'LARGE_ROOM_UNDERUSED'       // big room occupied by a small group
  | 'EXCESSIVE_BLOCK_MOVEMENT';  // group zig-zagging between distant blocks

export type SolutionType =
  | 'REASSIGN_ROOM'
  | 'REASSIGN_LAB'
  | 'CHANGE_TIME_SLOT'
  | 'CHANGE_DATE'
  | 'SWAP_ROOMS'
  | 'SWAP_FACULTY'
  | 'RESCHEDULE_CLASS'
  | 'MOVE_EXAM_VENUE'
  | 'CHANGE_EXAM_TIME'
  | 'MOVE_EVENT'
  | 'COMBINED';

// ---------------------------------------------------------------- Resources
export interface UnavailabilitySlot {
  day: number;          // 0=Sun .. 6=Sat (weekly recurring)
  date?: string;        // optional specific date YYYY-MM-DD
  startMin: number;     // minutes from midnight
  endMin: number;
  reason: string;
}

export interface FacultyPreferences {
  noEarlyMorning?: boolean;   // no classes before 09:00
  noLateEvening?: boolean;    // no classes after 17:00
  preferBlockId?: string;     // preferred block
  maxConsecutiveClasses?: number;
  notes?: string;
}

export interface EngineBlock {
  id: string;
  code: string;   // "B24"
  name: string;   // "Block 24 - School of Computer Science"
  campus: string;
}

export interface EngineSchool {
  id: string;
  code: string;   // "SCSE"
  name: string;
  blockId: string;
  blockCode: string;
}

export interface EngineRoom {
  id: string;
  code: string;   // "B24-105"
  roomNo: string;
  name: string;
  blockId: string;
  blockCode: string;
  roomType: RoomType;
  capacity: number;
  isExamVenue: boolean;
  features: Record<string, unknown>; // {projector, computers, labType}
  unavailable: UnavailabilitySlot[];
}

export interface EngineFaculty {
  id: string;
  code: string;   // "FAC-101"
  name: string;
  email: string;
  schoolId: string;
  schoolCode: string;
  designation: string;
  maxWeeklyHours: number;
  unavailable: UnavailabilitySlot[];
  preferences: FacultyPreferences;
}

export interface EngineStudentGroup {
  id: string;
  code: string;   // "CSE23-A"
  name: string;
  programId: string;
  programCode: string;
  semester: number;
  section: string;
  size: number;
}

export interface EngineCourse {
  id: string;
  code: string;   // "CSE301"
  name: string;
  schoolId: string;
  schoolCode: string;
  credits: number;
  courseType: 'THEORY' | 'LAB' | 'THEORY_LAB';
  requiresLab: boolean;
  examDurationMin: number;
}

// ---------------------------------------------------------------- Activities
export interface EngineActivity {
  id: string;
  activityCode: string;   // "ACT-0042"
  courseCode: string;
  courseName: string;
  sectionCode: string;    // "CSE301-A"
  programCode: string;
  schoolCode: string;
  facultyId: string;
  facultyName: string;
  studentGroupId: string;
  studentGroupCode: string;
  roomId: string;
  roomCode: string;
  blockId: string;
  blockCode: string;
  activityType: ActivityType;
  date: string;           // YYYY-MM-DD
  dayOfWeek: number;      // 0=Sun .. 6=Sat
  startMin: number;
  endMin: number;
  capacityRequired: number;
  notes?: string;
  status: 'SCHEDULED' | 'CANCELLED';
}

// ---------------------------------------------------------------- Schedule state
export interface ScheduleState {
  activities: EngineActivity[];
  rooms: EngineRoom[];
  faculty: EngineFaculty[];
  studentGroups: EngineStudentGroup[];
  courses: EngineCourse[];
  schools: EngineSchool[];
  blocks: EngineBlock[];
}

// ---------------------------------------------------------------- Rules
export interface SchedulingRuleConfig {
  // Time windows
  dayStartMin: number;              // 8*60 = 480
  dayEndMin: number;                // 19*60 = 1140
  allowedDays: number[];            // [1,2,3,4,5,6] Mon-Sat
  standardSlots: Array<{ startMin: number; endMin: number }>;
  // Capacity
  capacityStrict: boolean;          // hard fail if room < required
  capacityTolerancePct: number;     // soft warning if utilization < X%
  // Faculty
  defaultMaxFacultyWeeklyHours: number;
  minBreakBetweenClasses: number;   // minutes
  maxConsecutiveClasses: number;
  // Students
  maxDailyGapHours: number;         // soft threshold for idle gaps
  earlyClassStartMin: number;       // before this = "early"
  lateClassEndMin: number;          // after this = "late"
  // Rooms
  roomUtilizationThresholdPct: number; // weekly, below = underutilized
  largeRoomCapacity: number;        // >= this is "large"
  largeRoomMinFillPct: number;      // large room used with fill below this = waste
  // Movement
  maxBlockMovesPerDay: number;
  // Exams
  minGapBetweenExamsMin: number;    // spacing between two exams for same group
  examVenueStrict: boolean;         // exams must be in isExamVenue rooms
}

// ---------------------------------------------------------------- Conflicts
export interface AffectedResources {
  rooms: string[];        // room codes
  faculty: string[];      // faculty names
  studentGroups: string[];// group codes
  courses: string[];      // course codes
  blocks: string[];       // block codes
  dates: string[];
}

export interface CascadeNode {
  level: number;                     // 1 = direct, 2 = secondary...
  description: string;
  activityId?: string;
  activityCode?: string;
  resource: string;
  conflictType?: ConflictType;
  severity?: Severity;
}

export interface DetectedConflict {
  conflictType: ConflictType;
  category: ConflictCategory;
  severity: Severity;
  activityIds: string[];
  activities: EngineActivity[];
  affectedResources: AffectedResources;
  rootCause: string;
  directImpact: string;
  cascadingImpact: CascadeNode[];
  signature: string; // deterministic identity for diffing (used in what-if + cascade)
}

// ---------------------------------------------------------------- Candidate solutions
export interface ChangeSpec {
  activityId: string;
  activityCode: string;
  field: 'roomId' | 'facultyId' | 'date' | 'startMin' | 'endMin' | 'blockId';
  from: string | number;
  to: string | number;
  displayLabel: string; // human label e.g. "Room"
  displayFrom?: string;
  displayTo?: string;
}

export interface ValidationReport {
  engineVerified: true;
  targetConflictResolved: boolean;
  newHardConflicts: Array<{ type: ConflictType; description: string; signature: string }>;
  newSoftConflicts: Array<{ type: ConflictType; description: string; signature: string }>;
  checks: Array<{ name: string; passed: boolean; detail: string }>;
  failed: boolean;
}

export interface CandidateSolution {
  solutionType: SolutionType;
  title: string;
  changes: ChangeSpec[];
  valid: boolean;
  validationReport: ValidationReport;
  score: number;
  reasoning: string;
  expectedBenefits: string[];
  sideEffects: string[];
  meta: Record<string, unknown>; // extra info (e.g. room capacity)
}

// ---------------------------------------------------------------- What-if
export interface SimulationChangeInput {
  activityId: string;
  field: 'roomId' | 'facultyId' | 'date' | 'startMin' | 'endMin';
  value: string | number;
}

export interface SimulationDelta {
  conflictsResolved: Array<{ signature: string; type: ConflictType; description: string }>;
  conflictsCreated: Array<{ signature: string; type: ConflictType; description: string }>;
  affectedFaculty: string[];
  affectedStudentGroups: string[];
  affectedRooms: string[];
  capacityChanges: Array<{ roomCode: string; before: number; after: number; note: string }>;
  workloadChanges: Array<{ facultyName: string; before: number; after: number }>;
  timetableChanges: Array<{ activityCode: string; description: string }>;
  overallImpact: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
  impactScore: number; // -100..100
  summary: string;
}
