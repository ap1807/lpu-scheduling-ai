import { db } from '@/lib/db';
import { requireAuth } from '@/lib/session';
import { loadScheduleState, loadRules } from '@/lib/data/loader';
import { detectConflicts, facultyWeeklyHours, roomUtilization, minutesToHHMM, DAY_SHORT } from '@/lib/engine';

export async function GET() {
  try {
    const user = await requireAuth();
    const state = await loadScheduleState();
    const rules = await loadRules();
    const conflicts = detectConflicts(state, rules);

    // RBAC scoping
    const isWide = user.role === 'ADMIN' || user.role === 'SCHEDULER';
    let scopedActivities = state.activities;
    let scopedConflicts = conflicts;
    let scopeLabel = 'University-wide';
    if (user.role === 'FACULTY' && user.linkedFacultyId) {
      const fid = user.linkedFacultyId;
      const f = state.faculty.find((x) => x.id === fid || x.code === fid);
      scopedActivities = state.activities.filter((a) => f && (a.facultyId === f.id || a.facultyId === f.code));
      scopedConflicts = conflicts.filter((c) => c.activities.some((a) => f && (a.facultyId === f.id || a.facultyId === f.code)));
      scopeLabel = f ? `Faculty: ${f.name}` : 'Faculty';
    } else if (user.role === 'STUDENT' && user.linkedGroupId) {
      const gid = user.linkedGroupId;
      const g = state.studentGroups.find((x) => x.id === gid || x.code === gid);
      scopedActivities = state.activities.filter((a) => g && (a.studentGroupId === g.id || a.studentGroupId === g.code));
      scopedConflicts = conflicts.filter((c) => c.activities.some((a) => g && (a.studentGroupId === g.id || a.studentGroupId === g.code)));
      scopeLabel = g ? `Student group: ${g.code}` : 'Student';
    }

    const classrooms = state.rooms.filter((r) => r.roomType === 'CLASSROOM');
    const labs = state.rooms.filter((r) => r.roomType === 'LABORATORY');
    const examVenues = state.rooms.filter((r) => r.isExamVenue);

    // ---------- KPIs ----------
    const sectionsSet = new Set(scopedActivities.filter((a) => a.activityType !== 'EVENT').map((a) => `${a.courseCode}|${a.sectionCode}`));
    const persistedConflicts = await db.conflictRecord.findMany();
    const resolvedConflicts = persistedConflicts.filter((c) => c.status === 'RESOLVED').length;
    const dismissedConflicts = persistedConflicts.filter((c) => c.status === 'DISMISSED').length;
    const pendingRequests = await db.resolutionRequest.count({ where: { status: 'AWAITING_APPROVAL' } });

    const critical = scopedConflicts.filter((c) => c.severity === 'CRITICAL').length;
    const high = scopedConflicts.filter((c) => c.severity === 'HIGH').length;
    const medium = scopedConflicts.filter((c) => c.severity === 'MEDIUM').length;
    const low = scopedConflicts.filter((c) => c.severity === 'LOW').length;
    const active = scopedConflicts.length;

    // Schedule health: 100 - weighted penalty (capped)
    const health = Math.max(0, Math.min(100, Math.round(100 - critical * 6 - high * 3.5 - medium * 1.2 - low * 0.4)));

    // ---------- Analytics ----------
    const byType: Record<string, number> = {};
    scopedConflicts.forEach((c) => (byType[c.conflictType] = (byType[c.conflictType] ?? 0) + 1));
    const bySeverity = [
      { name: 'Critical', value: critical },
      { name: 'High', value: high },
      { name: 'Medium', value: medium },
      { name: 'Low', value: low },
    ];

    const utils = roomUtilization(state, rules);
    const classroomUtil = utils
      .filter((r) => r.roomType === 'CLASSROOM')
      .map((r) => ({ code: r.code, block: r.blockCode, capacity: r.capacity, pct: r.usedPct, hours: r.hours }))
      .sort((a, b) => b.pct - a.pct);
    const labUtil = utils
      .filter((r) => r.roomType === 'LABORATORY')
      .map((r) => ({ code: r.code, block: r.blockCode, capacity: r.capacity, pct: r.usedPct, hours: r.hours }))
      .sort((a, b) => b.pct - a.pct);

    const workloads = facultyWeeklyHours(state)
      .map((f) => ({ name: f.name, school: f.schoolCode, hours: f.hours, max: f.max, pct: Math.min(140, Math.round((f.hours / Math.max(1, f.max)) * 100)) }))
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 14);

    // capacity fill of classroom bookings
    const fills = scopedActivities
      .filter((a) => a.activityType !== 'EVENT' && a.activityType !== 'EXAM')
      .map((a) => {
        const room = state.rooms.find((r) => r.id === a.roomId);
        return room ? Math.min(150, Math.round((a.capacityRequired / room.capacity) * 100)) : 0;
      });
    const avgFill = fills.length ? Math.round(fills.reduce((s, v) => s + v, 0) / fills.length) : 0;
    const overfull = scopedActivities.filter((a) => {
      const room = state.rooms.find((r) => r.id === a.roomId);
      return room && a.capacityRequired > room.capacity;
    }).length;

    // timetable distribution
    const byDay: Record<string, number> = {};
    scopedActivities.forEach((a) => {
      byDay[DAY_SHORT[a.dayOfWeek]] = (byDay[DAY_SHORT[a.dayOfWeek]] ?? 0) + 1;
    });
    const dayOrder = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const timetableByDay = dayOrder.map((d) => ({ name: d, classes: byDay[d] ?? 0 }));
    const slotBuckets: Record<string, number> = {};
    scopedActivities.forEach((a) => {
      const hour = `${minutesToHHMM(Math.floor(a.startMin / 60) * 60).slice(0, 2)}:00`;
      slotBuckets[hour] = (slotBuckets[hour] ?? 0) + 1;
    });
    const timetableByHour = Object.entries(slotBuckets).sort().map(([name, count]) => ({ name, classes: count }));

    // conflicts by school & block
    const bySchool: Record<string, number> = {};
    const byBlock: Record<string, number> = {};
    scopedConflicts.forEach((c) => {
      const schools = new Set(c.activities.map((a) => a.schoolCode));
      schools.forEach((s) => (bySchool[s] = (bySchool[s] ?? 0) + 1));
      const blocks = new Set(c.activities.map((a) => a.blockCode));
      blocks.forEach((b) => (byBlock[b] = (byBlock[b] ?? 0) + 1));
    });

    // conflicts by date
    const byDate: Record<string, number> = {};
    scopedConflicts.forEach((c) => c.affectedResources.dates.forEach((d) => (byDate[d] = (byDate[d] ?? 0) + 1)));

    // exam analytics
    const exams = state.activities.filter((a) => a.activityType === 'EXAM');
    const examConflicts = scopedConflicts.filter(
      (c) => c.conflictType === 'EXAM_GROUP_OVERLAP' || c.conflictType === 'EXAM_VENUE_INCOMPATIBLE' || c.activities.some((a) => a.activityType === 'EXAM')
    );

    // resolution stats
    const requests = await db.resolutionRequest.findMany({ select: { status: true } });
    const resolutionStats = {
      total: requests.length,
      awaiting: requests.filter((r) => r.status === 'AWAITING_APPROVAL').length,
      approved: requests.filter((r) => r.status === 'APPROVED' || r.status === 'APPLIED').length,
      rejected: requests.filter((r) => r.status === 'REJECTED').length,
    };

    const dates = Array.from(new Set(state.activities.map((a) => a.date))).sort();

    return Response.json({
      scope: { role: user.role, label: scopeLabel, wide: isWide },
      kpis: {
        totalCourses: isWide ? state.courses.length : new Set(scopedActivities.map((a) => a.courseCode)).size,
        activeSections: sectionsSet.size,
        facultyMembers: isWide ? state.faculty.length : new Set(scopedActivities.map((a) => a.facultyId)).size,
        classrooms: classrooms.length,
        laboratories: labs.length,
        examRooms: examVenues.length,
        scheduledClasses: scopedActivities.filter((a) => ['CLASS', 'TUTORIAL', 'LAB', 'SEMINAR', 'WORKSHOP'].includes(a.activityType)).length,
        examinations: scopedActivities.filter((a) => a.activityType === 'EXAM').length,
        events: scopedActivities.filter((a) => a.activityType === 'EVENT').length,
        activeConflicts: active,
        criticalConflicts: critical,
        highConflicts: high,
        resolvedConflicts,
        dismissedConflicts,
        pendingRecommendations: pendingRequests,
        scheduleHealth: health,
        totalActivities: scopedActivities.length,
        studentGroups: state.studentGroups.length,
        academicBlocks: state.blocks.length,
        schools: state.schools.length,
      },
      analytics: {
        conflictsByType: Object.entries(byType).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
        conflictsBySeverity: bySeverity,
        conflictsBySchool: Object.entries(bySchool).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
        conflictsByBlock: Object.entries(byBlock).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
        conflictsByDate: Object.entries(byDate).sort().map(([name, value]) => ({ name, value })),
        classroomUtilization: classroomUtil.slice(0, 16),
        labUtilization: labUtil,
        facultyWorkload: workloads,
        capacityUtilization: { avgFill, overfull },
        timetableByDay,
        timetableByHour,
        exam: {
          totalExams: exams.length,
          examConflicts: examConflicts.length,
          byType: examConflicts.map((c) => c.conflictType),
          dates: Array.from(new Set(exams.map((e) => e.date))).sort(),
        },
        resolutionStats,
      },
      window: { dates, start: dates[0], end: dates[dates.length - 1] },
    });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: err instanceof Error ? err.message : 'Overview failed' }, { status: 500 });
  }
}
