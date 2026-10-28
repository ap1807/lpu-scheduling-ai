'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { SeverityBadge, StatusBadge, TypeBadge, EmptyState, dateLabel } from '@/components/shared/ui-bits';
import { fetchConflicts, type ConflictListRow } from '@/lib/client-api';
import { useAppStore } from '@/store/app-store';
import { ConflictDetail } from './conflict-detail';
import { cn } from '@/lib/utils';
import { AlertTriangle, Search, ChevronRight, Flame, ShieldAlert, CheckCircle2, Layers } from 'lucide-react';

export function ConflictCenterView() {
  const [search, setSearch] = useState('');
  const [severity, setSeverity] = useState('all');
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState('ACTIVE');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [held, setHeld] = useState<ConflictListRow | null>(null); // keep detail mounted after status changes (e.g. post-approval)

  const role = (useSession().data?.user as { role?: string })?.role ?? 'STUDENT';
  const params = useAppStore((s) => s.params);
  const clearParams = useAppStore((s) => s.clearParams);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['conflicts', { q: search, severity, category, status }],
    queryFn: () => fetchConflicts({ q: search || undefined, severity: severity !== 'all' ? severity : undefined, category: category !== 'all' ? category : undefined, status: status !== 'all' ? status : undefined }),
    refetchInterval: 30_000,
  });

  const conflicts = useMemo(() => data?.conflicts ?? [], [data]);

  // deep link from assistant / dashboard
  const deepLink = params.conflictId;
  const activeId = useMemo(() => {
    if (deepLink) {
      const match = conflicts.find((c) => c.id === deepLink || c.id === `live-${deepLink}`);
      if (match) return match.id;
    }
    return selectedId;
  }, [deepLink, conflicts, selectedId]);

  const selected = useMemo(() => {
    const fromList = conflicts.find((c) => c.id === activeId);
    if (fromList) return fromList;
    if (held && held.id === activeId) return held; // resolved mid-view: keep detail open with last known row
    return null;
  }, [conflicts, activeId, held]);

  const counts = useMemo(() => {
    const active = conflicts.filter((c) => c.status !== 'RESOLVED' && c.status !== 'DISMISSED');
    const c = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 } as Record<string, number>;
    active.forEach((x) => (c[x.severity] = (c[x.severity] ?? 0) + 1));
    return c;
  }, [conflicts]);

  const onBack = () => {
    setSelectedId(null);
    setHeld(null);
    if (deepLink) clearParams();
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full max-w-2xl" />
        <div className="grid lg:grid-cols-[1fr_1.4fr] gap-4">
          <Skeleton className="h-96 rounded-lg" />
          <Skeleton className="h-96 rounded-lg" />
        </div>
      </div>
    );
  }

  // ---------- detail view ----------
  if (activeId && (selected || held?.id === activeId)) {
    const row = selected ?? held!;
    return <ConflictDetail key={row.id} conflict={row} onBack={onBack} onChanged={() => { queryClient.invalidateQueries(); setHeld((h) => h); }} />;
  }

  // ---------- list view ----------
  return (
    <div className="space-y-4">
      {/* summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <SummaryTile label="Active in view" value={conflicts.filter((c) => c.status !== 'RESOLVED' && c.status !== 'DISMISSED').length} icon={Layers} />
        <SummaryTile label="Critical" value={counts.CRITICAL} icon={Flame} tone="red" />
        <SummaryTile label="High" value={counts.HIGH} icon={ShieldAlert} tone="orange" />
        <SummaryTile label="Medium" value={counts.MEDIUM} icon={AlertTriangle} tone="amber" />
        <SummaryTile label="Resolved" value={conflicts.filter((c) => c.status === 'RESOLVED').length} icon={CheckCircle2} tone="green" />
      </div>

      {/* filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search conflicts — course, room, faculty, cause…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
        </div>
        <Select value={severity} onValueChange={setSeverity}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All severity</SelectItem>
            <SelectItem value="CRITICAL">Critical</SelectItem>
            <SelectItem value="HIGH">High</SelectItem>
            <SelectItem value="MEDIUM">Medium</SelectItem>
            <SelectItem value="LOW">Low</SelectItem>
          </SelectContent>
        </Select>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="HARD">Hard conflicts</SelectItem>
            <SelectItem value="SOFT">Soft conflicts</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="OPEN">Open</SelectItem>
            <SelectItem value="RESOLUTION_PENDING">Awaiting resolution</SelectItem>
            <SelectItem value="RESOLVED">Resolved</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* list */}
      {conflicts.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="No conflicts match the filters"
          description="Adjust filters, or re-run detection from the dashboard to refresh the engine scan."
        />
      ) : (
        <div className="grid gap-2">
          {conflicts.map((c) => (
            <Card
              key={c.id}
              className={cn(
                'cursor-pointer hover:shadow-md hover:border-orange-300 transition py-0 overflow-hidden',
                c.severity === 'CRITICAL' && 'border-l-4 border-l-red-500',
                c.severity === 'HIGH' && 'border-l-4 border-l-orange-500',
                c.severity === 'MEDIUM' && 'border-l-4 border-l-amber-400',
                c.severity === 'LOW' && 'border-l-4 border-l-slate-300'
              )}
              onClick={() => {
                setSelectedId(c.id);
                setHeld(c);
              }}
            >
              <CardContent className="p-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[10px] text-muted-foreground">{c.code}</span>
                    <TypeBadge type={c.conflictType} />
                    <SeverityBadge severity={c.severity} />
                    <StatusBadge status={c.status} />
                    {c.category === 'SOFT' && <TypeBadge type="SOFT" />}
                  </div>
                  <div className="text-sm mt-1.5 line-clamp-2 text-foreground/90">{c.rootCause}</div>
                  <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3">
                    <span>📅 {c.dates.map(dateLabel).join(', ') || '—'}</span>
                    {c.preview && <span className="truncate max-w-md">{c.preview}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="hidden sm:inline">{c.activityCount} record{c.activityCount > 1 ? 's' : ''}</span>
                  <ChevronRight className="w-4 h-4 text-orange-600" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {role === 'FACULTY' && (
        <div className="text-[11px] text-muted-foreground">Faculty view: only conflicts involving your teaching assignments are shown (server-side enforced).</div>
      )}
    </div>
  );
}

function SummaryTile({ label, value, icon: Icon, tone }: { label: string; value: number; icon: React.ComponentType<{ className?: string }>; tone?: string }) {
  const tones: Record<string, string> = {
    red: 'bg-red-50 text-red-600 dark:bg-red-950/40',
    orange: 'bg-orange-50 text-orange-600 dark:bg-orange-950/40',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40',
    green: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40',
  };
  return (
    <div className="rounded-xl border glass-panel glass-hover p-3 flex items-center gap-3">
      <div className={cn('w-8 h-8 rounded-md flex items-center justify-center', tones[tone ?? ''] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-800')}>
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <div className="text-xl font-bold tabular-nums">{value}</div>
        <div className="text-[11px] text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}
