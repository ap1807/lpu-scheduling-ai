import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireRole, requireAuth } from '@/lib/session';
import { loadScheduleState, loadRules, detectedFromRow } from '@/lib/data/loader';
import { applyChangesToOfficialSchedule } from '@/lib/data/apply';
import type { ChangeSpec } from '@/lib/engine/types';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    await requireAuth();
    const { id } = await params;
    const request = await db.resolutionRequest.findUnique({
      where: { id },
      include: { candidates: true },
    });
    if (!request) return Response.json({ error: 'Resolution request not found' }, { status: 404 });
    return Response.json({
      request: {
        ...request,
        stages: JSON.parse(request.stages),
        recommendation: request.recommendation ? JSON.parse(request.recommendation) : null,
        candidates: request.candidates
          .map((c) => ({
            id: c.id, rank: c.rank, title: c.title, solutionType: c.solutionType, valid: c.valid,
            score: c.score, status: c.status, changes: JSON.parse(c.changes),
            validation: JSON.parse(c.validationReport), expectedBenefits: JSON.parse(c.expectedBenefits),
            sideEffects: JSON.parse(c.sideEffects), reasoning: c.reasoning,
          }))
          .sort((a, b) => a.rank - b.rank),
      },
    });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: 'Failed to load resolution request' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    // Human-in-the-loop: ONLY administrators may approve; schedulers may reject
    const user = await requireRole(['ADMIN', 'SCHEDULER']);
    const { id } = await params;
    const body = await req.json();
    const decision = String(body.decision ?? '').toUpperCase();
    const candidateId = body.candidateId ? String(body.candidateId) : null;
    const note = body.note ? String(body.note) : '';

    if (!['APPROVE', 'REJECT'].includes(decision)) {
      return Response.json({ error: 'decision must be APPROVE or REJECT' }, { status: 400 });
    }
    if (decision === 'APPROVE' && user.role !== 'ADMIN') {
      return Response.json({ error: 'Only System Administrators can approve schedule changes. Schedulers may request approval or reject.' }, { status: 403 });
    }

    const request = await db.resolutionRequest.findUnique({ where: { id }, include: { candidates: true } });
    if (!request) return Response.json({ error: 'Resolution request not found' }, { status: 404 });
    if (request.status !== 'AWAITING_APPROVAL') {
      return Response.json({ error: `Request already ${request.status.toLowerCase()}` }, { status: 400 });
    }

    const conflictRow = await db.conflictRecord.findUnique({ where: { id: request.conflictId } });
    if (!conflictRow) return Response.json({ error: 'Conflict no longer exists' }, { status: 400 });

    if (decision === 'REJECT') {
      await db.resolutionRequest.update({
        where: { id },
        data: { status: 'REJECTED', decidedBy: user.name, decidedAt: new Date(), decisionNote: note },
      });
      await db.candidateSolution.updateMany({ where: { requestId: id, status: 'SELECTED' }, data: { status: 'REJECTED' } });
      await db.conflictRecord.update({
        where: { id: request.conflictId },
        data: { status: 'OPEN', resolutionNote: `AI recommendation rejected by ${user.name}${note ? `: ${note}` : ''}` },
      });
      await db.auditLog.create({
        data: {
          code: `AUD-${String((await db.auditLog.count()) + 1).padStart(4, '0')}`,
          action: 'SOLUTION_REJECTED',
          actorId: user.id,
          actorName: user.name,
          actorRole: user.role,
          conflictId: request.conflictId,
          conflictCode: request.conflictCode,
          targetType: 'RESOLUTION_REQUEST',
          targetId: id,
          summary: `Rejected AI recommendation for ${request.conflictCode}${note ? ` — note: ${note}` : ''}. No changes were applied to the official timetable.`,
          details: JSON.stringify({ request: request.code, note }),
        },
      });
      return Response.json({ decision: 'REJECTED', applied: false });
    }

    // ---- APPROVE: apply the SELECTED (or specified) candidate
    const candidate =
      request.candidates.find((c) => c.id === candidateId) ??
      request.candidates.find((c) => c.status === 'SELECTED' && c.valid) ??
      null;
    if (!candidate) return Response.json({ error: 'No valid selected candidate to apply' }, { status: 400 });
    if (!candidate.valid) return Response.json({ error: 'Selected candidate failed engine validation and cannot be applied' }, { status: 400 });

    const state = await loadScheduleState();
    const rules = await loadRules();
    const conflict = detectedFromRow(conflictRow, state);
    const changes: ChangeSpec[] = JSON.parse(candidate.changes);

    const result = await applyChangesToOfficialSchedule(changes, conflict, { id: user.id, name: user.name, role: user.role });

    if (!result.applied) {
      await db.resolutionRequest.update({
        where: { id },
        data: { status: 'FAILED', decidedBy: user.name, decidedAt: new Date(), decisionNote: result.reason ?? 'Re-validation failed' },
      });
      return Response.json({ decision: 'APPROVE', applied: false, reason: result.reason }, { status: 409 });
    }

    await db.resolutionRequest.update({
      where: { id },
      data: { status: 'APPLIED', decidedBy: user.name, decidedAt: new Date(), decisionNote: note },
    });
    await db.candidateSolution.update({ where: { id: candidate.id }, data: { status: 'APPLIED' } });
    await db.candidateSolution.updateMany({ where: { requestId: id, status: { not: 'APPLIED' } }, data: { status: 'REJECTED' } });
    await db.conflictRecord.update({
      where: { id: request.conflictId },
      data: {
        status: result.originalConflictResolved ? 'RESOLVED' : 'OPEN',
        resolvedAt: result.originalConflictResolved ? new Date() : null,
        resolutionNote: `Resolved via ${request.code} — applied "${candidate.title}" (approved by ${user.name}). Post-change verification: ${result.conflictStatus}, ${result.newConflictsIntroduced.length} new conflict(s) flagged.`,
      },
    });

    // approval audit entry (change + verification recorded by apply module)
    await db.auditLog.create({
      data: {
        code: `AUD-${String((await db.auditLog.count()) + 1).padStart(4, '0')}`,
        action: 'SOLUTION_APPROVED',
        actorId: user.id,
        actorName: user.name,
        actorRole: user.role,
        conflictId: request.conflictId,
        conflictCode: request.conflictCode,
        targetType: 'RESOLUTION_REQUEST',
        targetId: id,
        summary: `Approved candidate "${candidate.title}" (score ${candidate.score}) for ${request.conflictCode}. Applied to official schedule; post-change re-detection: original conflict ${result.originalConflictResolved ? 'RESOLVED' : 'STILL PRESENT'}, ${result.newConflictsIntroduced.length} new conflict(s).`,
        details: JSON.stringify({
          candidate: { title: candidate.title, type: candidate.solutionType, score: candidate.score, changes: JSON.parse(candidate.changes) },
          verification: result,
        }),
      },
    });

    return Response.json({
      decision: 'APPROVED',
      applied: true,
      result,
      verification: {
        originalConflictResolved: result.originalConflictResolved,
        newConflictsIntroduced: result.newConflictsIntroduced,
        postDetection: result.postDetectionSummary,
        status: result.conflictStatus,
      },
    });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: err instanceof Error ? err.message : 'Decision failed' }, { status: 500 });
  }
}
