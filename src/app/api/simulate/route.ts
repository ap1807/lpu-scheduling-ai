import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/session';
import { loadScheduleState, loadRules } from '@/lib/data/loader';
import { runSimulation, analyzeCascade } from '@/lib/engine';
import type { SimulationChangeInput } from '@/lib/engine/types';

export async function GET() {
  try {
    const user = await requireRole(['ADMIN', 'SCHEDULER']);
    const scenarios = await db.simulationScenario.findMany({ orderBy: { createdAt: 'desc' }, take: 30 });
    return Response.json({
      scenarios: scenarios.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        status: s.status,
        createdAt: s.createdAt,
        changes: JSON.parse(s.changes),
        result: JSON.parse(s.result),
        createdBy: s.createdByName,
      })),
    });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: 'Failed to load scenarios' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireRole(['ADMIN', 'SCHEDULER']);
    const body = await req.json();
    const changes: SimulationChangeInput[] = Array.isArray(body.changes) ? body.changes : [];
    if (changes.length === 0) return Response.json({ error: 'At least one change is required' }, { status: 400 });

    for (const ch of changes) {
      if (!ch.activityId || !ch.field || ch.value === undefined) {
        return Response.json({ error: 'Each change needs activityId, field and value' }, { status: 400 });
      }
      if (!['roomId', 'facultyId', 'date', 'startMin', 'endMin'].includes(ch.field)) {
        return Response.json({ error: `Unsupported field: ${ch.field}` }, { status: 400 });
      }
    }

    const state = await loadScheduleState();
    const rules = await loadRules();

    const delta = runSimulation(state, rules, changes);
    const cascade = analyzeCascade(state, rules, changes);

    // Optional persistence (save scenario)
    let scenarioId: string | null = null;
    if (body.save && body.name) {
      const scenario = await db.simulationScenario.create({
        data: {
          name: String(body.name),
          description: body.description ? String(body.description) : null,
          createdBy: user.id,
          createdByName: user.name,
          changes: JSON.stringify(changes),
          result: JSON.stringify({ delta, cascade: { chain: cascade.chain, hasCascadingRisk: cascade.hasCascadingRisk } }),
        },
      });
      scenarioId = scenario.id;

      await db.auditLog.create({
        data: {
          code: `AUD-${String((await db.auditLog.count()) + 1).padStart(4, '0')}`,
          action: 'SIMULATION_CREATED',
          actorId: user.id,
          actorName: user.name,
          actorRole: user.role,
          targetType: 'SIMULATION_SCENARIO',
          targetId: scenario.id,
          summary: `What-If scenario "${body.name}" simulated: ${delta.summary}`,
          details: JSON.stringify({ changes, delta: { resolved: delta.conflictsResolved.length, created: delta.conflictsCreated.length, impact: delta.impactScore } }),
        },
      });
    }

    return Response.json({ scenarioId, delta, cascade: { chain: cascade.chain, newConflicts: cascade.newConflicts, hasCascadingRisk: cascade.hasCascadingRisk } });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: err instanceof Error ? err.message : 'Simulation failed' }, { status: 500 });
  }
}
