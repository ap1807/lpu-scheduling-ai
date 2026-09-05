import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/session';
import { loadScheduleState, loadRules, detectedFromRow, runAndPersistConflictDetection } from '@/lib/data/loader';
import { validateChanges } from '@/lib/engine';
import { applyChangesToOfficialSchedule } from '@/lib/data/apply';
import type { ChangeSpec, SimulationChangeInput } from '@/lib/engine/types';

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requireRole(['ADMIN', 'SCHEDULER']);
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const note = body.note ? String(body.note) : '';

    const scenario = await db.simulationScenario.findUnique({ where: { id } });
    if (!scenario) return Response.json({ error: 'Scenario not found' }, { status: 404 });
    if (scenario.status === 'APPLIED') return Response.json({ error: 'Scenario already applied' }, { status: 400 });

    // simulate->ChangeSpec: extend raw changes with display info
    const raw: SimulationChangeInput[] = JSON.parse(scenario.changes);
    const state = await loadScheduleState();
    const rules = await loadRules();
    const changes: ChangeSpec[] = raw.map((ch) => {
      const act = state.activities.find((a) => a.id === ch.activityId);
      let displayLabel = ch.field;
      let displayTo = String(ch.value);
      if (ch.field === 'roomId') {
        const room = state.rooms.find((r) => r.id === String(ch.value) || r.code === String(ch.value));
        displayLabel = 'Room';
        displayTo = room ? `${room.code} (${room.name})` : String(ch.value);
      } else if (ch.field === 'facultyId') {
        const f = state.faculty.find((x) => x.id === String(ch.value) || x.code === String(ch.value));
        displayLabel = 'Faculty';
        displayTo = f?.name ?? String(ch.value);
      } else if (ch.field === 'date') {
        displayLabel = 'Date';
      } else if (ch.field === 'startMin' || ch.field === 'endMin') {
        displayLabel = 'Time';
        const v = Number(ch.value);
        displayTo = `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
      }
      return {
        activityId: ch.activityId,
        activityCode: act?.activityCode ?? ch.activityId,
        field: ch.field,
        from: (act as unknown as Record<string, string | number>)?.[ch.field] ?? '',
        to: ch.value,
        displayLabel,
        displayTo,
      };
    });

    // Engine re-validates the scenario against the CURRENT schedule before applying
    const validation = validateChanges(state, rules, changes, null);
    if (!validation.valid) {
      return Response.json(
        { error: 'Engine re-validation failed against the current schedule — scenario is stale. Re-run the simulation.', report: validation.report },
        { status: 409 }
      );
    }

    const result = await applyChangesToOfficialSchedule(changes, null, { id: user.id, name: user.name, role: user.role });
    if (!result.applied) {
      return Response.json({ error: result.reason ?? 'Apply failed' }, { status: 409 });
    }

    await db.simulationScenario.update({ where: { id }, data: { status: 'APPLIED' } });
    await runAndPersistConflictDetection();
    void detectedFromRow;
    void note;

    await db.auditLog.create({
      data: {
        code: `AUD-${String((await db.auditLog.count()) + 1).padStart(4, '0')}`,
        action: 'SIMULATION_APPLIED',
        actorId: user.id,
        actorName: user.name,
        actorRole: user.role,
        targetType: 'SIMULATION_SCENARIO',
        targetId: id,
        summary: `Applied What-If scenario "${scenario.name}" to the official schedule. Post-apply detection: ${result.postDetectionSummary.total} conflicts.`,
        details: JSON.stringify({ changes, result }),
      },
    });

    return Response.json({ applied: true, result });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: err instanceof Error ? err.message : 'Apply failed' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    await requireRole(['ADMIN', 'SCHEDULER']);
    const { id } = await params;
    await db.simulationScenario.update({ where: { id }, data: { status: 'DISCARDED' } });
    return Response.json({ discarded: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: 'Discard failed' }, { status: 500 });
  }
}
