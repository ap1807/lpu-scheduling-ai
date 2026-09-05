import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/session';
import { loadScheduleState } from '@/lib/data/loader';
import { minutesToHHMM, DAY_NAMES, durationLabel } from '@/lib/engine/util';
import type { DetectedConflict } from '@/lib/engine/types';
import { detectedFromRow } from '@/lib/data/loader';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    const row = await db.conflictRecord.findUnique({ where: { id } });
    if (!row) return Response.json({ error: 'Conflict not found' }, { status: 404 });

    const state = await loadScheduleState();
    const conflict: DetectedConflict = detectedFromRow(row, state);
    const snapActs = JSON.parse(row.activitiesSnapshot) as Array<Record<string, string | number>>;

    // RBAC check for faculty/student
    if (user.role === 'FACULTY' && user.linkedFacultyId) {
      const f = state.faculty.find((x) => x.id === user.linkedFacultyId || x.code === user.linkedFacultyId);
      if (!conflict.activities.some((a) => f && (a.facultyId === f.id || a.facultyId === f.code))) {
        return Response.json({ error: 'This conflict does not involve your teaching assignments' }, { status: 403 });
      }
    } else if (user.role === 'STUDENT' && user.linkedGroupId) {
      const g = state.studentGroups.find((x) => x.id === user.linkedGroupId || x.code === user.linkedGroupId);
      if (!conflict.activities.some((a) => g && (a.studentGroupId === g.id || a.studentGroupId === g.code))) {
        return Response.json({ error: 'This conflict does not involve your student group' }, { status: 403 });
      }
    }

    // resolution requests for this conflict
    const requests = await db.resolutionRequest.findMany({
      where: { conflictId: row.id },
      orderBy: { createdAt: 'desc' },
      include: { candidates: true },
    });

    return Response.json({
      conflict: {
        id: row.id,
        code: row.code,
        conflictType: row.conflictType,
        category: row.category,
        severity: row.severity,
        status: row.status,
        rootCause: row.rootCause,
        directImpact: row.directImpact,
        cascadingImpact: JSON.parse(row.cascadingImpact),
        affectedResources: JSON.parse(row.affectedResources),
        detectedAt: row.detectedAt,
        lastAnalyzedAt: row.lastAnalyzedAt,
        resolvedAt: row.resolvedAt,
        resolutionNote: row.resolutionNote,
      },
      activities: conflict.activities.map((a) => ({
        id: a.id,
        activityCode: a.activityCode,
        courseCode: a.courseCode,
        courseName: a.courseName,
        sectionCode: a.sectionCode,
        activityType: a.activityType,
        date: a.date,
        day: DAY_NAMES[a.dayOfWeek],
        time: durationLabel(a.startMin, a.endMin),
        startMin: a.startMin,
        endMin: a.endMin,
        roomCode: a.roomCode,
        roomName: state.rooms.find((r) => r.id === a.roomId)?.name,
        roomCapacity: state.rooms.find((r) => r.id === a.roomId)?.capacity,
        facultyName: a.facultyName,
        studentGroupCode: a.studentGroupCode,
        capacityRequired: a.capacityRequired,
        blockCode: a.blockCode,
        notes: a.notes,
        schoolCode: a.schoolCode,
      })),
      snapshot: snapActs,
      resolutionRequests: requests.map((r) => ({
        id: r.id,
        code: r.code,
        status: r.status,
        createdAt: r.createdAt,
        requestedByName: r.requestedByName,
        decidedBy: r.decidedBy,
        decidedAt: r.decidedAt,
        decisionNote: r.decisionNote,
        stages: JSON.parse(r.stages),
        narrative: r.aiNarrative,
        recommendation: r.recommendation ? JSON.parse(r.recommendation) : null,
        candidates: r.candidates
          .map((c) => ({
            id: c.id,
            rank: c.rank,
            title: c.title,
            solutionType: c.solutionType,
            valid: c.valid,
            score: c.score,
            status: c.status,
            changes: JSON.parse(c.changes),
            validation: JSON.parse(c.validationReport),
            expectedBenefits: JSON.parse(c.expectedBenefits),
            sideEffects: JSON.parse(c.sideEffects),
            reasoning: c.reasoning,
          }))
          .sort((a, b) => a.rank - b.rank),
      })),
      engineVerification: {
        verifiedBy: 'Deterministic Scheduling Engine (independent of AI layer)',
        detectionPass: 'detectConflicts(state, rules) — full schedule scan',
      },
    });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: err instanceof Error ? err.message : 'Failed to load conflict' }, { status: 500 });
  }
}

void minutesToHHMM;
