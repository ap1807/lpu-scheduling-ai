import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/session';
import { loadScheduleState, loadRules } from '@/lib/data/loader';
import { detectConflicts } from '@/lib/engine';
import { minutesToHHMM } from '@/lib/engine/util';

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth();
    const sp = req.nextUrl.searchParams;
    const severity = sp.get('severity');
    const category = sp.get('category');
    const status = sp.get('status');
    const type = sp.get('type');
    const search = sp.get('q')?.toLowerCase();
    const date = sp.get('date');

    // Persisted conflicts (keeps human workflow status), enriched with live activities
    const state = await loadScheduleState();
    const rules = await loadRules();
    const live = detectConflicts(state, rules);
    const rows = await db.conflictRecord.findMany({ orderBy: [{ severity: 'asc' }, { detectedAt: 'desc' }] });

    // resolve any new live conflicts not yet persisted (self-healing list)
    const persistedTypes = new Map(rows.map((r) => [`${r.conflictType}|${r.rootCause}`, r]));
    const merged = [...rows];
    for (const c of live) {
      const key = `${c.conflictType}|${c.rootCause}`;
      if (!persistedTypes.has(key)) {
        merged.push({
          id: `live-${c.signature}`,
          code: `LIVE-${merged.length + 1}`,
          conflictType: c.conflictType,
          category: c.category,
          severity: c.severity,
          status: 'OPEN',
          activityIds: JSON.stringify(c.activityIds),
          activitiesSnapshot: JSON.stringify(c.activities),
          affectedResources: JSON.stringify(c.affectedResources),
          rootCause: c.rootCause,
          directImpact: c.directImpact,
          cascadingImpact: JSON.stringify(c.cascadingImpact),
          detectedAt: new Date(),
          lastAnalyzedAt: null,
          resolvedAt: null,
          resolutionNote: null,
        } as (typeof rows)[0]);
      }
    }

    let result = merged.map((r) => {
      const acts = JSON.parse(r.activitiesSnapshot as string) as Array<{
        activityCode: string; courseCode: string; sectionCode: string; facultyName: string;
        studentGroupCode: string; roomCode: string; date: string; startMin: number; endMin: number; activityType: string; blockCode: string;
      }>;
      return {
        id: r.id,
        code: r.code,
        conflictType: r.conflictType,
        category: r.category,
        severity: r.severity,
        status: r.status,
        rootCause: r.rootCause,
        directImpact: r.directImpact,
        affectedResources: JSON.parse(r.affectedResources as string),
        cascadingImpact: JSON.parse(r.cascadingImpact as string),
        detectedAt: r.detectedAt,
        resolvedAt: r.resolvedAt,
        resolutionNote: r.resolutionNote,
        activityCount: acts.length,
        preview: acts
          .slice(0, 2)
          .map((a) => `${a.courseCode} ${a.sectionCode} · ${minutesToHHMM(a.startMin)}–${minutesToHHMM(a.endMin)} · ${a.roomCode}`)
          .join('  vs  '),
        dates: Array.from(new Set(acts.map((a) => a.date))).sort(),
      };
    });

    // RBAC scoping
    if (user.role === 'FACULTY' && user.linkedFacultyId) {
      const f = state.faculty.find((x) => x.id === user.linkedFacultyId || x.code === user.linkedFacultyId);
      result = result.filter((c) => JSON.parse(String(c.affectedResources)).faculty?.includes(f?.name ?? '###'));
    } else if (user.role === 'STUDENT' && user.linkedGroupId) {
      const g = state.studentGroups.find((x) => x.id === user.linkedGroupId || x.code === user.linkedGroupId);
      result = result.filter((c) => JSON.parse(String(c.affectedResources)).studentGroups?.some((gc: string) => g?.code === gc || gc.startsWith(g?.code.split('-')[0] ?? '###')));
    }

    if (severity) result = result.filter((c) => c.severity === severity);
    if (category) result = result.filter((c) => c.category === category);
    if (status === 'ACTIVE') result = result.filter((c) => c.status !== 'RESOLVED' && c.status !== 'DISMISSED');
    else if (status) result = result.filter((c) => c.status === status);
    if (type) result = result.filter((c) => c.conflictType === type);
    if (date) result = result.filter((c) => c.dates.includes(date));
    if (search) {
      result = result.filter((c) =>
        [c.code, c.conflictType, c.rootCause, c.preview, JSON.stringify(c.affectedResources)].join(' ').toLowerCase().includes(search)
      );
    }

    const order: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    result.sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9) || a.code.localeCompare(b.code));

    return Response.json({ conflicts: result, total: result.length });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: err instanceof Error ? err.message : 'Failed to load conflicts' }, { status: 500 });
  }
}
