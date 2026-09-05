/**
 * LPU-style reference data — fictional but realistic.
 * No real personal data is used; all identities are sample records.
 */
import { EngineBlock, EngineCourse, EngineFaculty, EngineRoom, EngineSchool, EngineStudentGroup, UnavailabilitySlot, FacultyPreferences } from '@/lib/engine/types';

export const BLOCKS: EngineBlock[] = [
  { id: 'B24', code: 'B24', name: 'Block 24 — School of Computer Science & Engineering', campus: 'Main Campus, Phagwara' },
  { id: 'B25', code: 'B25', name: 'Block 25 — Computer Science Laboratories', campus: 'Main Campus, Phagwara' },
  { id: 'B26', code: 'B26', name: 'Block 26 — School of Electronics & Electrical Engineering', campus: 'Main Campus, Phagwara' },
  { id: 'B27', code: 'B27', name: 'Block 27 — School of Mechanical Engineering', campus: 'Main Campus, Phagwara' },
  { id: 'B31', code: 'B31', name: 'Block 31 — Lovely School of Management', campus: 'Main Campus, Phagwara' },
  { id: 'B32', code: 'B32', name: 'Block 32 — School of Bio-Engineering & Applied Sciences', campus: 'Main Campus, Phagwara' },
  { id: 'B38', code: 'B38', name: 'Block 38 — Central Examination Halls & Auditorium', campus: 'Main Campus, Phagwara' },
  { id: 'B41', code: 'B41', name: 'Block 41 — School of Hotel Management', campus: 'Main Campus, Phagwara' },
];

export const SCHOOLS: EngineSchool[] = [
  { id: 'SCSE', code: 'SCSE', name: 'School of Computer Science & Engineering', blockId: 'B24', blockCode: 'B24' },
  { id: 'SEEE', code: 'SEEE', name: 'School of Electronics & Electrical Engineering', blockId: 'B26', blockCode: 'B26' },
  { id: 'SME', code: 'SME', name: 'School of Mechanical Engineering', blockId: 'B27', blockCode: 'B27' },
  { id: 'SOM', code: 'SOM', name: 'Lovely School of Management', blockId: 'B31', blockCode: 'B31' },
  { id: 'SBAS', code: 'SBAS', name: 'School of Bio-Engineering & Applied Sciences', blockId: 'B32', blockCode: 'B32' },
  { id: 'SOHM', code: 'SOHM', name: 'School of Hotel Management', blockId: 'B41', blockCode: 'B41' },
];

export const PROGRAMS = [
  { id: 'BTech-CSE', code: 'BTech-CSE', name: 'B.Tech Computer Science & Engineering', schoolId: 'SCSE', degreeLevel: 'UG' },
  { id: 'BTech-ECE', code: 'BTech-ECE', name: 'B.Tech Electronics & Communication Engineering', schoolId: 'SEEE', degreeLevel: 'UG' },
  { id: 'BTech-ME', code: 'BTech-ME', name: 'B.Tech Mechanical Engineering', schoolId: 'SME', degreeLevel: 'UG' },
  { id: 'MBA', code: 'MBA', name: 'Master of Business Administration', schoolId: 'SOM', degreeLevel: 'PG' },
  { id: 'BSc-BIO', code: 'BSc-BIO', name: 'B.Sc Bio-Engineering', schoolId: 'SBAS', degreeLevel: 'UG' },
  { id: 'BSc-HM', code: 'BSc-HM', name: 'B.Sc Hotel Management', schoolId: 'SOHM', degreeLevel: 'UG' },
  { id: 'GEN', code: 'GEN', name: 'University-wide Activities & Events', schoolId: 'SOM', degreeLevel: 'UG' },
];

interface CourseSeed { id: string; code: string; name: string; schoolId: string; credits: number; courseType: 'THEORY' | 'LAB' | 'THEORY_LAB'; requiresLab: boolean; examDurationMin: number; faculty: string[] }

export const COURSES: CourseSeed[] = [
  // SCSE — Sem 5 (CSE23)
  { id: 'CSE301', code: 'CSE301', name: 'Database Management Systems', schoolId: 'SCSE', credits: 4, courseType: 'THEORY_LAB', requiresLab: true, examDurationMin: 180, faculty: ['FAC-101', 'FAC-109'] },
  { id: 'CSE302', code: 'CSE302', name: 'Operating Systems', schoolId: 'SCSE', credits: 4, courseType: 'THEORY', requiresLab: false, examDurationMin: 180, faculty: ['FAC-104', 'FAC-108'] },
  { id: 'CSE303', code: 'CSE303', name: 'Computer Networks', schoolId: 'SCSE', credits: 4, courseType: 'THEORY_LAB', requiresLab: true, examDurationMin: 180, faculty: ['FAC-103', 'FAC-107'] },
  { id: 'CSE304', code: 'CSE304', name: 'Software Engineering', schoolId: 'SCSE', credits: 3, courseType: 'THEORY', requiresLab: false, examDurationMin: 180, faculty: ['FAC-106', 'FAC-105'] },
  { id: 'CSE305', code: 'CSE305', name: 'Design & Analysis of Algorithms', schoolId: 'SCSE', credits: 4, courseType: 'THEORY', requiresLab: false, examDurationMin: 180, faculty: ['FAC-102', 'FAC-105'] },
  // SCSE — Sem 3 (CSE24)
  { id: 'CSE201', code: 'CSE201', name: 'Data Structures & Algorithms', schoolId: 'SCSE', credits: 4, courseType: 'THEORY_LAB', requiresLab: true, examDurationMin: 180, faculty: ['FAC-105', 'FAC-107'] },
  { id: 'CSE202', code: 'CSE202', name: 'Object-Oriented Programming', schoolId: 'SCSE', credits: 4, courseType: 'THEORY_LAB', requiresLab: true, examDurationMin: 180, faculty: ['FAC-105', 'FAC-108'] },
  { id: 'CSE203', code: 'CSE203', name: 'Discrete Mathematics', schoolId: 'SCSE', credits: 3, courseType: 'THEORY', requiresLab: false, examDurationMin: 180, faculty: ['FAC-102', 'FAC-107'] },
  { id: 'CSE204', code: 'CSE204', name: 'Digital Logic Design', schoolId: 'SCSE', credits: 4, courseType: 'THEORY_LAB', requiresLab: true, examDurationMin: 180, faculty: ['FAC-109', 'FAC-105'] },
  { id: 'CSE307', code: 'CSE307', name: 'Human-Computer Interaction (Open Elective)', schoolId: 'SCSE', credits: 3, courseType: 'THEORY', requiresLab: false, examDurationMin: 120, faculty: ['FAC-108', 'FAC-109'] },
  // SEEE — Sem 5
  { id: 'ECE301', code: 'ECE301', name: 'Signals & Systems', schoolId: 'SEEE', credits: 4, courseType: 'THEORY', requiresLab: false, examDurationMin: 180, faculty: ['FAC-201', 'FAC-204'] },
  { id: 'ECE302', code: 'ECE302', name: 'Microprocessors & Interfacing', schoolId: 'SEEE', credits: 4, courseType: 'THEORY_LAB', requiresLab: true, examDurationMin: 180, faculty: ['FAC-202', 'FAC-203'] },
  { id: 'ECE303', code: 'ECE303', name: 'Communication Systems', schoolId: 'SEEE', credits: 4, courseType: 'THEORY', requiresLab: false, examDurationMin: 180, faculty: ['FAC-203', 'FAC-204'] },
  { id: 'ECE304', code: 'ECE304', name: 'VLSI Design', schoolId: 'SEEE', credits: 3, courseType: 'THEORY_LAB', requiresLab: true, examDurationMin: 180, faculty: ['FAC-204', 'FAC-205'] },
  // SME — Sem 5
  { id: 'ME301', code: 'ME301', name: 'Thermodynamics', schoolId: 'SME', credits: 4, courseType: 'THEORY', requiresLab: false, examDurationMin: 180, faculty: ['FAC-301', 'FAC-303'] },
  { id: 'ME302', code: 'ME302', name: 'Machine Design', schoolId: 'SME', credits: 4, courseType: 'THEORY', requiresLab: false, examDurationMin: 180, faculty: ['FAC-302', 'FAC-301'] },
  { id: 'ME303', code: 'ME303', name: 'Manufacturing Processes', schoolId: 'SME', credits: 3, courseType: 'LAB', requiresLab: true, examDurationMin: 180, faculty: ['FAC-303', 'FAC-302'] },
  // SOM — Sem 1
  { id: 'MGT101', code: 'MGT101', name: 'Organizational Behaviour', schoolId: 'SOM', credits: 3, courseType: 'THEORY', requiresLab: false, examDurationMin: 120, faculty: ['FAC-401', 'FAC-402'] },
  { id: 'MGT102', code: 'MGT102', name: 'Financial Accounting', schoolId: 'SOM', credits: 3, courseType: 'THEORY', requiresLab: false, examDurationMin: 120, faculty: ['FAC-402', 'FAC-403'] },
  { id: 'MGT103', code: 'MGT103', name: 'Marketing Management', schoolId: 'SOM', credits: 3, courseType: 'THEORY', requiresLab: false, examDurationMin: 120, faculty: ['FAC-404', 'FAC-401'] },
  { id: 'MGT104', code: 'MGT104', name: 'Business Economics', schoolId: 'SOM', credits: 3, courseType: 'THEORY', requiresLab: false, examDurationMin: 120, faculty: ['FAC-403', 'FAC-404'] },
  // SOHM — Sem 3
  { id: 'HM201', code: 'HM201', name: 'Food Production Operations', schoolId: 'SOHM', credits: 4, courseType: 'THEORY_LAB', requiresLab: true, examDurationMin: 180, faculty: ['FAC-501', 'FAC-503'] },
  { id: 'HM202', code: 'HM202', name: 'Front Office Operations', schoolId: 'SOHM', credits: 3, courseType: 'THEORY', requiresLab: false, examDurationMin: 120, faculty: ['FAC-502', 'FAC-501'] },
  { id: 'HM203', code: 'HM203', name: 'Housekeeping Management', schoolId: 'SOHM', credits: 3, courseType: 'THEORY', requiresLab: false, examDurationMin: 120, faculty: ['FAC-503', 'FAC-502'] },
  // SBAS — Sem 5
  { id: 'BIO301', code: 'BIO301', name: 'Biochemistry', schoolId: 'SBAS', credits: 4, courseType: 'THEORY', requiresLab: false, examDurationMin: 180, faculty: ['FAC-601', 'FAC-602'] },
  { id: 'BIO302', code: 'BIO302', name: 'Bioprocess Technology', schoolId: 'SBAS', credits: 4, courseType: 'THEORY_LAB', requiresLab: true, examDurationMin: 180, faculty: ['FAC-602', 'FAC-603'] },
  { id: 'BIO303', code: 'BIO303', name: 'Genetic Engineering', schoolId: 'SBAS', credits: 3, courseType: 'THEORY', requiresLab: false, examDurationMin: 180, faculty: ['FAC-603', 'FAC-601'] },
];

interface FacultySeed {
  id: string; code: string; name: string; email: string; schoolId: string; designation: string;
  maxWeeklyHours: number; unavailable: UnavailabilitySlot[]; preferences: FacultyPreferences;
}

const noUn: UnavailabilitySlot[] = [];

export const FACULTY: FacultySeed[] = [
  // SCSE
  { id: 'FAC-101', code: 'FAC-101', name: 'Dr. Rajesh Kumar', email: 'rajesh.kumar@lpu.co.in', schoolId: 'SCSE', designation: 'Professor', maxWeeklyHours: 18, unavailable: noUn, preferences: { preferBlockId: 'B24' } },
  { id: 'FAC-102', code: 'FAC-102', name: 'Dr. Neha Gupta', email: 'neha.gupta@lpu.co.in', schoolId: 'SCSE', designation: 'Professor & Head of Department', maxWeeklyHours: 10, unavailable: noUn, preferences: {} },
  { id: 'FAC-103', code: 'FAC-103', name: 'Dr. Sandeep Verma', email: 'sandeep.verma@lpu.co.in', schoolId: 'SCSE', designation: 'Associate Professor', maxWeeklyHours: 18, unavailable: noUn, preferences: { preferBlockId: 'B24' } },
  { id: 'FAC-104', code: 'FAC-104', name: 'Dr. Kavita Joshi', email: 'kavita.joshi@lpu.co.in', schoolId: 'SCSE', designation: 'Associate Professor', maxWeeklyHours: 18, unavailable: [{ day: 4, startMin: 8 * 60, endMin: 19 * 60, reason: 'IEEE Conference presentation, New Delhi' }], preferences: {} },
  { id: 'FAC-105', code: 'FAC-105', name: 'Dr. Manish Tiwari', email: 'manish.tiwari@lpu.co.in', schoolId: 'SCSE', designation: 'Assistant Professor', maxWeeklyHours: 20, unavailable: noUn, preferences: {} },
  { id: 'FAC-106', code: 'FAC-106', name: 'Prof. Amit Malhotra', email: 'amit.malhotra@lpu.co.in', schoolId: 'SCSE', designation: 'Professor', maxWeeklyHours: 16, unavailable: noUn, preferences: { noLateEvening: true } },
  { id: 'FAC-107', code: 'FAC-107', name: 'Dr. Shalini Nair', email: 'shalini.nair@lpu.co.in', schoolId: 'SCSE', designation: 'Assistant Professor', maxWeeklyHours: 20, unavailable: noUn, preferences: {} },
  { id: 'FAC-108', code: 'FAC-108', name: 'Dr. Vikram Sethi', email: 'vikram.sethi@lpu.co.in', schoolId: 'SCSE', designation: 'Assistant Professor', maxWeeklyHours: 20, unavailable: noUn, preferences: {} },
  { id: 'FAC-109', code: 'FAC-109', name: 'Dr. Anjali Deshpande', email: 'anjali.deshpande@lpu.co.in', schoolId: 'SCSE', designation: 'Associate Professor', maxWeeklyHours: 18, unavailable: noUn, preferences: { noEarlyMorning: true } },
  // SEEE
  { id: 'FAC-201', code: 'FAC-201', name: 'Dr. Suresh Nambiar', email: 'suresh.nambiar@lpu.co.in', schoolId: 'SEEE', designation: 'Professor', maxWeeklyHours: 18, unavailable: noUn, preferences: {} },
  { id: 'FAC-202', code: 'FAC-202', name: 'Dr. Ritu Chawla', email: 'ritu.chawla@lpu.co.in', schoolId: 'SEEE', designation: 'Associate Professor', maxWeeklyHours: 18, unavailable: noUn, preferences: {} },
  { id: 'FAC-203', code: 'FAC-203', name: 'Dr. Deepak Bansal', email: 'deepak.bansal@lpu.co.in', schoolId: 'SEEE', designation: 'Assistant Professor', maxWeeklyHours: 20, unavailable: noUn, preferences: {} },
  { id: 'FAC-204', code: 'FAC-204', name: 'Dr. Meera Krishnan', email: 'meera.krishnan@lpu.co.in', schoolId: 'SEEE', designation: 'Associate Professor', maxWeeklyHours: 18, unavailable: noUn, preferences: {} },
  { id: 'FAC-205', code: 'FAC-205', name: 'Dr. Farhan Ali', email: 'farhan.ali@lpu.co.in', schoolId: 'SEEE', designation: 'Assistant Professor', maxWeeklyHours: 20, unavailable: noUn, preferences: {} },
  // SME
  { id: 'FAC-301', code: 'FAC-301', name: 'Dr. Harpreet Singh', email: 'harpreet.singh@lpu.co.in', schoolId: 'SME', designation: 'Professor', maxWeeklyHours: 18, unavailable: noUn, preferences: {} },
  { id: 'FAC-302', code: 'FAC-302', name: 'Dr. Gurpreet Dhillon', email: 'gurpreet.dhillon@lpu.co.in', schoolId: 'SME', designation: 'Associate Professor', maxWeeklyHours: 18, unavailable: noUn, preferences: {} },
  { id: 'FAC-303', code: 'FAC-303', name: 'Dr. Naresh Chandra', email: 'naresh.chandra@lpu.co.in', schoolId: 'SME', designation: 'Assistant Professor', maxWeeklyHours: 20, unavailable: noUn, preferences: {} },
  // SOM
  { id: 'FAC-401', code: 'FAC-401', name: 'Dr. Sanjay Bakshi', email: 'sanjay.bakshi@lpu.co.in', schoolId: 'SOM', designation: 'Professor', maxWeeklyHours: 16, unavailable: noUn, preferences: {} },
  { id: 'FAC-402', code: 'FAC-402', name: 'Dr. Reema Mathur', email: 'reema.mathur@lpu.co.in', schoolId: 'SOM', designation: 'Associate Professor', maxWeeklyHours: 18, unavailable: noUn, preferences: {} },
  { id: 'FAC-403', code: 'FAC-403', name: 'Dr. Tarun Khanna', email: 'tarun.khanna@lpu.co.in', schoolId: 'SOM', designation: 'Associate Professor', maxWeeklyHours: 18, unavailable: noUn, preferences: {} },
  { id: 'FAC-404', code: 'FAC-404', name: 'Dr. Swati Kapoor', email: 'swati.kapoor@lpu.co.in', schoolId: 'SOM', designation: 'Assistant Professor', maxWeeklyHours: 20, unavailable: noUn, preferences: {} },
  // SOHM
  { id: 'FAC-501', code: 'FAC-501', name: 'Chef Vikas Shukla', email: 'vikas.shukla@lpu.co.in', schoolId: 'SOHM', designation: 'Chef-Instructor', maxWeeklyHours: 20, unavailable: noUn, preferences: {} },
  { id: 'FAC-502', code: 'FAC-502', name: 'Dr. Meenal Rathore', email: 'meenal.rathore@lpu.co.in', schoolId: 'SOHM', designation: 'Associate Professor', maxWeeklyHours: 18, unavailable: noUn, preferences: {} },
  { id: 'FAC-503', code: 'FAC-503', name: 'Mr. Karan Mehta', email: 'karan.mehta@lpu.co.in', schoolId: 'SOHM', designation: 'Assistant Professor', maxWeeklyHours: 20, unavailable: noUn, preferences: {} },
  // SBAS
  { id: 'FAC-601', code: 'FAC-601', name: 'Dr. Leela Iyer', email: 'leela.iyer@lpu.co.in', schoolId: 'SBAS', designation: 'Professor', maxWeeklyHours: 18, unavailable: noUn, preferences: {} },
  { id: 'FAC-602', code: 'FAC-602', name: 'Dr. Om Prakash', email: 'om.prakash@lpu.co.in', schoolId: 'SBAS', designation: 'Associate Professor', maxWeeklyHours: 18, unavailable: noUn, preferences: {} },
  { id: 'FAC-603', code: 'FAC-603', name: 'Dr. Sarah Thomas', email: 'sarah.thomas@lpu.co.in', schoolId: 'SBAS', designation: 'Assistant Professor', maxWeeklyHours: 20, unavailable: noUn, preferences: {} },
];

interface RoomSeed { id: string; code: string; roomNo: string; name: string; blockId: string; roomType: EngineRoom['roomType']; capacity: number; isExamVenue: boolean; features: Record<string, unknown>; unavailable: UnavailabilitySlot[] }

export const ROOMS: RoomSeed[] = [
  // B24 — classrooms
  { id: 'B24-101', code: 'B24-101', roomNo: '101', name: 'Lecture Room 101', blockId: 'B24', roomType: 'CLASSROOM', capacity: 75, isExamVenue: false, features: { projector: true, ac: true }, unavailable: noUn },
  { id: 'B24-102', code: 'B24-102', roomNo: '102', name: 'Lecture Room 102', blockId: 'B24', roomType: 'CLASSROOM', capacity: 75, isExamVenue: false, features: { projector: true, ac: true }, unavailable: noUn },
  { id: 'B24-103', code: 'B24-103', roomNo: '103', name: 'Lecture Room 103', blockId: 'B24', roomType: 'CLASSROOM', capacity: 75, isExamVenue: false, features: { projector: true, ac: true }, unavailable: noUn },
  { id: 'B24-104', code: 'B24-104', roomNo: '104', name: 'Lecture Room 104', blockId: 'B24', roomType: 'CLASSROOM', capacity: 75, isExamVenue: false, features: { projector: true, ac: true }, unavailable: noUn },
  { id: 'B24-105', code: 'B24-105', roomNo: '105', name: 'Gallery Hall 105 (Seminar Theatre)', blockId: 'B24', roomType: 'CLASSROOM', capacity: 180, isExamVenue: true, features: { projector: true, ac: true, gallerySeating: true }, unavailable: noUn },
  { id: 'B24-106', code: 'B24-106', roomNo: '106', name: 'Lecture Room 106', blockId: 'B24', roomType: 'CLASSROOM', capacity: 75, isExamVenue: false, features: { projector: true, ac: true }, unavailable: noUn },
  { id: 'B24-107', code: 'B24-107', roomNo: '107', name: 'Lecture Room 107', blockId: 'B24', roomType: 'CLASSROOM', capacity: 75, isExamVenue: false, features: { projector: true, ac: true }, unavailable: noUn },
  { id: 'B24-108', code: 'B24-108', roomNo: '108', name: 'Lecture Room 108', blockId: 'B24', roomType: 'CLASSROOM', capacity: 76, isExamVenue: false, features: { projector: true, ac: true }, unavailable: noUn },
  { id: 'B24-201', code: 'B24-201', roomNo: '201', name: 'Lecture Room 201', blockId: 'B24', roomType: 'CLASSROOM', capacity: 80, isExamVenue: false, features: { projector: true, ac: true }, unavailable: noUn },
  { id: 'B24-202', code: 'B24-202', roomNo: '202', name: 'Lecture Room 202', blockId: 'B24', roomType: 'CLASSROOM', capacity: 80, isExamVenue: false, features: { projector: true, ac: true }, unavailable: noUn },
  { id: 'B24-203', code: 'B24-203', roomNo: '203', name: 'Lecture Room 203', blockId: 'B24', roomType: 'CLASSROOM', capacity: 72, isExamVenue: false, features: { projector: true, ac: true }, unavailable: noUn },
  { id: 'B24-204', code: 'B24-204', roomNo: '204', name: 'Lecture Room 204', blockId: 'B24', roomType: 'CLASSROOM', capacity: 72, isExamVenue: false, features: { projector: true, ac: true }, unavailable: noUn },
  // B25 — CS labs
  { id: 'B25-L1', code: 'B25-L1', roomNo: 'L1', name: 'Computer Lab 1', blockId: 'B25', roomType: 'LABORATORY', capacity: 80, isExamVenue: false, features: { computers: 80, os: 'Windows' }, unavailable: noUn },
  { id: 'B25-L2', code: 'B25-L2', roomNo: 'L2', name: 'Computer Lab 2', blockId: 'B25', roomType: 'LABORATORY', capacity: 80, isExamVenue: false, features: { computers: 80, os: 'Ubuntu' }, unavailable: noUn },
  { id: 'B25-L3', code: 'B25-L3', roomNo: 'L3', name: 'Networks Lab', blockId: 'B25', roomType: 'LABORATORY', capacity: 80, isExamVenue: false, features: { computers: 80, routers: 12, switches: 16 }, unavailable: [{ day: 1, startMin: 9 * 60, endMin: 12 * 60, reason: 'Quarterly network maintenance (IT Services)' }] },
  { id: 'B25-L4', code: 'B25-L4', roomNo: 'L4', name: 'Advanced Computing Lab', blockId: 'B25', roomType: 'LABORATORY', capacity: 90, isExamVenue: false, features: { computers: 90, gpus: true }, unavailable: noUn },
  { id: 'B25-L5', code: 'B25-L5', roomNo: 'L5', name: 'Systems Lab', blockId: 'B25', roomType: 'LABORATORY', capacity: 80, isExamVenue: false, features: { computers: 80, bareMetal: true }, unavailable: noUn },
  // B26 — ECE
  { id: 'B26-101', code: 'B26-101', roomNo: '101', name: 'Lecture Room 101', blockId: 'B26', roomType: 'CLASSROOM', capacity: 64, isExamVenue: false, features: { projector: true }, unavailable: noUn },
  { id: 'B26-102', code: 'B26-102', roomNo: '102', name: 'Lecture Room 102', blockId: 'B26', roomType: 'CLASSROOM', capacity: 64, isExamVenue: false, features: { projector: true }, unavailable: noUn },
  { id: 'B26-201', code: 'B26-201', roomNo: '201', name: 'Lecture Room 201', blockId: 'B26', roomType: 'CLASSROOM', capacity: 64, isExamVenue: false, features: { projector: true }, unavailable: noUn },
  { id: 'B26-202', code: 'B26-202', roomNo: '202', name: 'Lecture Room 202 (Renovated 2025)', blockId: 'B26', roomType: 'CLASSROOM', capacity: 72, isExamVenue: false, features: { projector: true }, unavailable: noUn },
  { id: 'B26-L1', code: 'B26-L1', roomNo: 'L1', name: 'Microprocessor Lab', blockId: 'B26', roomType: 'LABORATORY', capacity: 64, isExamVenue: false, features: { kits: 64, oscilloscopes: 20 }, unavailable: noUn },
  { id: 'B26-L2', code: 'B26-L2', roomNo: 'L2', name: 'Communication Lab', blockId: 'B26', roomType: 'LABORATORY', capacity: 60, isExamVenue: false, features: { spectrumAnalyzers: 10 }, unavailable: noUn },
  { id: 'B26-L3', code: 'B26-L3', roomNo: 'L3', name: 'VLSI Design Lab', blockId: 'B26', roomType: 'LABORATORY', capacity: 40, isExamVenue: false, features: { workstations: 40, edaTools: true }, unavailable: noUn },
  // B27 — ME
  { id: 'B27-101', code: 'B27-101', roomNo: '101', name: 'Lecture Room 101', blockId: 'B27', roomType: 'CLASSROOM', capacity: 60, isExamVenue: false, features: { projector: true }, unavailable: noUn },
  { id: 'B27-102', code: 'B27-102', roomNo: '102', name: 'Lecture Room 102', blockId: 'B27', roomType: 'CLASSROOM', capacity: 60, isExamVenue: false, features: { projector: true }, unavailable: noUn },
  { id: 'B27-L1', code: 'B27-L1', roomNo: 'L1', name: 'Manufacturing Workshop', blockId: 'B27', roomType: 'LABORATORY', capacity: 58, isExamVenue: false, features: { lathe: 12, cnc: 4 }, unavailable: noUn },
  { id: 'B27-L2', code: 'B27-L2', roomNo: 'L2', name: 'CAD/CAM Lab', blockId: 'B27', roomType: 'LABORATORY', capacity: 60, isExamVenue: false, features: { workstations: 60, cad: true }, unavailable: noUn },
  // B31 — SOM
  { id: 'B31-101', code: 'B31-101', roomNo: '101', name: 'Case Room 101', blockId: 'B31', roomType: 'CLASSROOM', capacity: 60, isExamVenue: false, features: { projector: true, boardRoom: true }, unavailable: noUn },
  { id: 'B31-102', code: 'B31-102', roomNo: '102', name: 'Case Room 102', blockId: 'B31', roomType: 'CLASSROOM', capacity: 65, isExamVenue: false, features: { projector: true }, unavailable: noUn },
  { id: 'B31-103', code: 'B31-103', roomNo: '103', name: 'Case Room 103', blockId: 'B31', roomType: 'CLASSROOM', capacity: 60, isExamVenue: false, features: { projector: true }, unavailable: noUn },
  { id: 'B31-L1', code: 'B31-L1', roomNo: 'L1', name: 'Seminar Hall (Management)', blockId: 'B31', roomType: 'SEMINAR_HALL', capacity: 80, isExamVenue: false, features: { projector: true, mics: true }, unavailable: noUn },
  // B32 — SBAS
  { id: 'B32-101', code: 'B32-101', roomNo: '101', name: 'Theory Room 101', blockId: 'B32', roomType: 'CLASSROOM', capacity: 40, isExamVenue: false, features: { projector: true }, unavailable: noUn },
  { id: 'B32-102', code: 'B32-102', roomNo: '102', name: 'Theory Room 102', blockId: 'B32', roomType: 'CLASSROOM', capacity: 40, isExamVenue: false, features: { projector: true }, unavailable: noUn },
  { id: 'B32-L1', code: 'B32-L1', roomNo: 'L1', name: 'Biochemistry Lab', blockId: 'B32', roomType: 'LABORATORY', capacity: 36, isExamVenue: false, features: { fumeHoods: 6 }, unavailable: noUn },
  { id: 'B32-L2', code: 'B32-L2', roomNo: 'L2', name: 'Bioprocess Lab', blockId: 'B32', roomType: 'LABORATORY', capacity: 35, isExamVenue: false, features: { fermenters: 8 }, unavailable: noUn },
  // B38 — exam halls & auditorium
  { id: 'B38-H1', code: 'B38-H1', roomNo: 'H1', name: 'Examination Hall 1', blockId: 'B38', roomType: 'EXAM_VENUE', capacity: 240, isExamVenue: true, features: { invigilationStations: 8 }, unavailable: noUn },
  { id: 'B38-H2', code: 'B38-H2', roomNo: 'H2', name: 'Examination Hall 2', blockId: 'B38', roomType: 'EXAM_VENUE', capacity: 240, isExamVenue: true, features: { invigilationStations: 8 }, unavailable: noUn },
  { id: 'B38-H3', code: 'B38-H3', roomNo: 'H3', name: 'Examination Hall 3', blockId: 'B38', roomType: 'EXAM_VENUE', capacity: 300, isExamVenue: true, features: { invigilationStations: 10 }, unavailable: noUn },
  { id: 'B38-H4', code: 'B38-H4', roomNo: 'H4', name: 'Examination Hall 4', blockId: 'B38', roomType: 'EXAM_VENUE', capacity: 200, isExamVenue: true, features: { invigilationStations: 7 }, unavailable: noUn },
  { id: 'B38-SDA', code: 'B38-SDA', roomNo: 'SDA', name: 'Shanti Devi Auditorium', blockId: 'B38', roomType: 'AUDITORIUM', capacity: 1200, isExamVenue: false, features: { stage: true, av: true }, unavailable: noUn },
  // B41 — SOHM
  { id: 'B41-101', code: 'B41-101', roomNo: '101', name: 'Theory Room 101', blockId: 'B41', roomType: 'CLASSROOM', capacity: 45, isExamVenue: false, features: { projector: true }, unavailable: noUn },
  { id: 'B41-102', code: 'B41-102', roomNo: '102', name: 'Theory Room 102', blockId: 'B41', roomType: 'CLASSROOM', capacity: 45, isExamVenue: false, features: { projector: true }, unavailable: noUn },
  { id: 'B41-T1', code: 'B41-T1', roomNo: 'T1', name: 'Training Kitchen 1', blockId: 'B41', roomType: 'LABORATORY', capacity: 40, isExamVenue: false, features: { kitchenStations: 20 }, unavailable: noUn },
  { id: 'B41-TR', code: 'B41-TR', roomNo: 'TR', name: 'Banquet Training Room', blockId: 'B41', roomType: 'SEMINAR_HALL', capacity: 40, isExamVenue: false, features: { banquetSetup: true }, unavailable: noUn },
];

interface GroupSeed { id: string; code: string; name: string; programId: string; semester: number; section: string; size: number }

export const STUDENT_GROUPS: GroupSeed[] = [
  { id: 'CSE23-A', code: 'CSE23-A', name: 'B.Tech CSE 2023 Batch — Section A (Sem 5)', programId: 'BTech-CSE', semester: 5, section: 'A', size: 70 },
  { id: 'CSE23-B', code: 'CSE23-B', name: 'B.Tech CSE 2023 Batch — Section B (Sem 5)', programId: 'BTech-CSE', semester: 5, section: 'B', size: 72 },
  { id: 'CSE23-C', code: 'CSE23-C', name: 'B.Tech CSE 2023 Batch — Section C (Sem 5)', programId: 'BTech-CSE', semester: 5, section: 'C', size: 68 },
  { id: 'CSE23-AB', code: 'CSE23-AB', name: 'B.Tech CSE 2023 Batch — Sections A+B Combined (Sem 5)', programId: 'BTech-CSE', semester: 5, section: 'A+B', size: 142 },
  { id: 'CSE24-A', code: 'CSE24-A', name: 'B.Tech CSE 2024 Batch — Section A (Sem 3)', programId: 'BTech-CSE', semester: 3, section: 'A', size: 72 },
  { id: 'CSE24-B', code: 'CSE24-B', name: 'B.Tech CSE 2024 Batch — Section B (Sem 3)', programId: 'BTech-CSE', semester: 3, section: 'B', size: 74 },
  { id: 'CSE24-C', code: 'CSE24-C', name: 'B.Tech CSE 2024 Batch — Section C (Sem 3)', programId: 'BTech-CSE', semester: 3, section: 'C', size: 74 },
  { id: 'ECE23-A', code: 'ECE23-A', name: 'B.Tech ECE 2023 Batch — Section A (Sem 5)', programId: 'BTech-ECE', semester: 5, section: 'A', size: 64 },
  { id: 'ECE23-B', code: 'ECE23-B', name: 'B.Tech ECE 2023 Batch — Section B (Sem 5)', programId: 'BTech-ECE', semester: 5, section: 'B', size: 60 },
  { id: 'ME23-A', code: 'ME23-A', name: 'B.Tech ME 2023 Batch — Section A (Sem 5)', programId: 'BTech-ME', semester: 5, section: 'A', size: 58 },
  { id: 'ME23-B', code: 'ME23-B', name: 'B.Tech ME 2023 Batch — Section B (Sem 5)', programId: 'BTech-ME', semester: 5, section: 'B', size: 56 },
  { id: 'MBA25-A', code: 'MBA25-A', name: 'MBA 2025 Batch — Section A (Sem 1)', programId: 'MBA', semester: 1, section: 'A', size: 60 },
  { id: 'MBA25-B', code: 'MBA25-B', name: 'MBA 2025 Batch — Section B (Sem 1)', programId: 'MBA', semester: 1, section: 'B', size: 58 },
  { id: 'HM24-A', code: 'HM24-A', name: 'B.Sc HM 2024 Batch — Section A (Sem 3)', programId: 'BSc-HM', semester: 3, section: 'A', size: 38 },
  { id: 'BIO23-A', code: 'BIO23-A', name: 'B.Sc Bio 2023 Batch — Section A (Sem 5)', programId: 'BSc-BIO', semester: 5, section: 'A', size: 34 },
  { id: 'UNIV', code: 'UNIV', name: 'University Community (Events & University-wide Activities)', programId: 'GEN', semester: 0, section: 'UNIV', size: 0 },
];

export const DEMO_USERS = [
  { email: 'admin@lpu.edu', password: 'Admin@123', name: 'Dr. Arvind Rana', role: 'ADMIN', title: 'System Administrator, Division of Academic Operations', linkedFacultyId: null, linkedGroupId: null },
  { email: 'scheduler@lpu.edu', password: 'Schedule@123', name: 'Ms. Priya Sharma', role: 'SCHEDULER', title: 'Academic Scheduler & Timetable Coordinator, SCSE', linkedFacultyId: null, linkedGroupId: null },
  { email: 'faculty@lpu.edu', password: 'Faculty@123', name: 'Dr. Rajesh Kumar', role: 'FACULTY', title: 'Professor, School of CSE', linkedFacultyId: 'FAC-101', linkedGroupId: null },
  { email: 'student@lpu.edu', password: 'Student@123', name: 'Ananya Verma', role: 'STUDENT', title: 'B.Tech CSE Sem 5, Section A (CSE23-A)', linkedFacultyId: null, linkedGroupId: 'CSE23-A' },
];
