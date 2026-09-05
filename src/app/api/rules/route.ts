import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, requireRole } from '@/lib/session';
import { DEFAULT_RULES } from '@/lib/engine/rules';
import type { SchedulingRuleConfig } from '@/lib/engine/types';

export async function GET() {
  try {
    await requireAuth();
    const rec = await db.schedulingRules.findUnique({ where: { id: 'main' } });
    const config = rec ? { ...DEFAULT_RULES, ...JSON.parse(rec.config) } : DEFAULT_RULES;
    return Response.json({ rules: config, defaults: DEFAULT_RULES });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: 'Failed to load rules' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireRole(['ADMIN']);
    const body = await req.json();
    const patch = body.rules ?? body;

    // Whitelist numeric/array fields; never trust arbitrary JSON
    const current = await db.schedulingRules.findUnique({ where: { id: 'main' } });
    const config: SchedulingRuleConfig = current ? { ...DEFAULT_RULES, ...JSON.parse(current.config) } : { ...DEFAULT_RULES };

    const numericFields: Array<keyof SchedulingRuleConfig> = [
      'dayStartMin', 'dayEndMin', 'capacityTolerancePct', 'defaultMaxFacultyWeeklyHours',
      'minBreakBetweenClasses', 'maxConsecutiveClasses', 'maxDailyGapHours', 'earlyClassStartMin',
      'lateClassEndMin', 'roomUtilizationThresholdPct', 'largeRoomCapacity', 'largeRoomMinFillPct',
      'maxBlockMovesPerDay', 'minGapBetweenExamsMin',
    ];
    for (const f of numericFields) {
      if (patch[f] !== undefined) {
        const v = Number(patch[f]);
        if (Number.isFinite(v) && v >= 0) (config[f] as number) = v;
      }
    }
    if (patch.capacityStrict !== undefined) config.capacityStrict = Boolean(patch.capacityStrict);
    if (patch.examVenueStrict !== undefined) config.examVenueStrict = Boolean(patch.examVenueStrict);
    if (Array.isArray(patch.allowedDays)) {
      config.allowedDays = (patch.allowedDays as unknown[]).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
    }

    if (config.dayEndMin <= config.dayStartMin) return Response.json({ error: 'Day end must be after day start' }, { status: 400 });
    if (config.dayEndMin > 24 * 60) return Response.json({ error: 'Day end cannot exceed 24:00' }, { status: 400 });

    await db.schedulingRules.upsert({
      where: { id: 'main' },
      update: { config: JSON.stringify(config) },
      create: { id: 'main', config: JSON.stringify(config) },
    });

    await db.auditLog.create({
      data: {
        code: `AUD-${String((await db.auditLog.count()) + 1).padStart(4, '0')}`,
        action: 'RULES_UPDATED',
        actorId: user.id,
        actorName: user.name,
        actorRole: user.role,
        targetType: 'SCHEDULING_RULES',
        targetId: 'main',
        summary: 'Scheduling rule configuration updated. Re-run conflict detection to apply the new policy to existing records.',
        details: JSON.stringify({ config }),
      },
    });

    return Response.json({ rules: config });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: err instanceof Error ? err.message : 'Rules update failed' }, { status: 500 });
  }
}
