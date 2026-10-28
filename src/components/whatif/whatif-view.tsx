'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, TypeBadge, formatMin, dateLabel } from '@/components/shared/ui-bits';
import { fetchActivities, fetchResources, runSimulation, fetchScenarios, applyScenario, type SimulationResult, type ActivityRow } from '@/lib/client-api';
import { useAppStore } from '@/store/app-store';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  GitBranch, Play, Loader2, Plus, Trash2, CheckCircle2, AlertTriangle, TrendingUp, TrendingDown, Minus,
  ArrowRight, Save, Layers, Users, DoorOpen, GraduationCap,
} from 'lucide-react';

interface ChangeDraft {
  activityId: string;
  field: 'roomId' | 'facultyId' | 'date' | 'startMin';
  value: string;
}

export function WhatIfView() {
  const params = useAppStore((s) => s.params);
  const [drafts, setDrafts] = useState<ChangeDraft[]>([]);
  const [primary, setPrimary] = useState<ActivityRow | null>(null);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [running, setRunning] = useState(false);
  const [scenarioName, setScenarioName] = useState('');
  const [addedPrimary, setAddedPrimary] = useState(false);

  const { data: activitiesData } = useQuery({ queryKey: ['activities', 'whatif'], queryFn: () => fetchActivities({}) });
  const { data: resources } = useQuery({ queryKey: ['resources'], queryFn: fetchResources, staleTime: 300_000 });
  const { data: scenarios, refetch: refetchScenarios } = useQuery({ queryKey: ['scenarios'], queryFn: fetchScenarios });
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const role = (useSession().data?.user as { role?: string })?.role ?? 'STUDENT';

  // preselect activity from assistant deep link
  const preselected = params.activityId;
  const activities = useMemo(() => activitiesData?.activities ?? [], [activitiesData]);
  useMemo(() => {
    if (preselected && activities.length && !addedPrimary && !primary) {
      const found = activities.find((a) => a.id === preselected);
      if (found) {
        setPrimary(found);
        setAddedPrimary(true);
        if (params.roomId) setDrafts([{ activityId: found.id, field: 'roomId', value: params.roomId }]);
      }
    }
  }, [preselected, activities, addedPrimary, primary, params.roomId]);

  const run = async (save?: boolean) => {
    const changes = drafts
      .filter((d) => d.activityId && d.value)
      .map((d) => ({ activityId: d.activityId, field: d.field, value: d.field === 'startMin' ? Number(d.value) : d.value }));
    if (changes.length === 0) {
      toast({ title: 'Nothing to simulate', description: 'Add at least one change below.', variant: 'destructive' });
      return;
    }
    setRunning(true);
    try {
      const res = await runSimulation(changes, save && scenarioName ? { name: scenarioName } : undefined);
      setResult(res);
      if (save) refetchScenarios();
      toast({ title: 'Simulation complete', description: res.delta.summary });
    } catch (e) {
      toast({ title: 'Simulation failed', description: e instanceof Error ? e.message : 'error', variant: 'destructive' });
    } finally {
      setRunning(false);
    }
  };

  const apply = useMutation({
    mutationFn: (id: string) => applyScenario(id),
    onSuccess: () => {
      toast({ title: 'Scenario applied', description: 'Official timetable updated; full engine re-scan completed.' });
      queryClient.invalidateQueries();
      refetchScenarios();
    },
    onError: (e: Error) => toast({ title: 'Apply failed', description: e.message, variant: 'destructive' }),
  });

  return (
    <div className="space-y-4">
      <div className="grid lg:grid-cols-[380px_1fr] gap-4">
        {/* ---------- builder ---------- */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2"><GitBranch className="w-4 h-4 text-orange-600" /> Scenario builder</CardTitle>
            <CardDescription className="text-xs">
              Propose changes on a copy of the schedule — the official timetable stays untouched until an administrator applies an approved scenario.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* primary activity */}
            <div className="space-y-1.5">
              <Label>Activity to modify</Label>
              <Select
                value={primary?.id ?? ''}
                onValueChange={(v) => {
                  const a = activities.find((x) => x.id === v) ?? null;
                  setPrimary(a);
                  setDrafts([]);
                  setResult(null);
                }}
              >
                <SelectTrigger><SelectValue placeholder="Pick an activity (search by code)" /></SelectTrigger>
                <SelectContent>
                  {activities.slice(0, 400).map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.activityCode} · {a.courseCode} {a.sectionCode} · {a.date} {formatMin(a.startMin)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {primary && (
                <div className="glass-well text-[11px] text-muted-foreground rounded-lg border border-transparent p-2 leading-relaxed">
                  <b>{primary.courseCode} {primary.sectionCode}</b> ({primary.courseName})<br />
                  {dateLabel(primary.date)} · {formatMin(primary.startMin)}–{formatMin(primary.endMin)} · {primary.roomCode} ({primary.blockCode})<br />
                  {primary.facultyName} · {primary.studentGroupCode} · {primary.capacityRequired} seats
                </div>
              )}
            </div>

            {/* changes */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Proposed changes</Label>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={!primary || drafts.length >= 3}
                  onClick={() => setDrafts([...drafts, { activityId: primary!.id, field: 'roomId', value: '' }])}
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add change
                </Button>
              </div>
              {drafts.length === 0 && (
                <div className="text-[11px] text-muted-foreground border border-dashed rounded p-3">
                  Add a room change, time shift, faculty swap or date move for the selected activity. Multiple changes are validated together.
                </div>
              )}
              {drafts.map((d, i) => (
                <div key={i} className="glass-panel rounded-lg border p-2.5 space-y-2">
                  <div className="flex items-center gap-2">
                    <Select value={d.field} onValueChange={(v) => setDrafts(drafts.map((x, j) => (j === i ? { ...x, field: v as ChangeDraft['field'] } : x)))}>
                      <SelectTrigger className="h-7 w-36 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="roomId">Move to room</SelectItem>
                        <SelectItem value="startMin">Change time</SelectItem>
                        <SelectItem value="date">Change date</SelectItem>
                        <SelectItem value="facultyId">Change faculty</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="icon" className="h-7 w-7 ml-auto" onClick={() => setDrafts(drafts.filter((_, j) => j !== i))} aria-label="Remove change">
                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    </Button>
                  </div>
                  {d.field === 'roomId' && (
                    <Select value={d.value || undefined} onValueChange={(v) => setDrafts(drafts.map((x, j) => (j === i ? { ...x, value: v } : x)))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Destination room" /></SelectTrigger>
                      <SelectContent>
                        {(resources?.rooms ?? []).filter((r) => r.id !== primary?.roomId).map((r) => (
                          <SelectItem key={r.id} value={r.id}>{r.code} — {r.name} ({r.roomType}, {r.capacity})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {d.field === 'startMin' && (
                    <Input type="time" value={d.value ? formatMin(Number(d.value)) : '10:00'} onChange={(e) => {
                      const [h, m] = e.target.value.split(':').map(Number);
                      setDrafts(drafts.map((x, j) => (j === i ? { ...x, value: String((h || 0) * 60 + (m || 0)) } : x)));
                    }} />
                  )}
                  {d.field === 'date' && (
                    <Input type="date" value={d.value} onChange={(e) => setDrafts(drafts.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
                  )}
                  {d.field === 'facultyId' && (
                    <Select value={d.value || undefined} onValueChange={(v) => setDrafts(drafts.map((x, j) => (j === i ? { ...x, value: v } : x)))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Replacement faculty" /></SelectTrigger>
                      <SelectContent>
                        {(resources?.faculty ?? []).filter((f) => f.id !== primary?.facultyId).map((f) => (
                          <SelectItem key={f.id} value={f.id}>{f.name} · {f.designation}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              ))}
            </div>

            {/* run */}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => run(false)} disabled={running || !primary} className="bg-orange-600 hover:bg-orange-700">
                {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                Run simulation
              </Button>
              <Button variant="outline" onClick={() => run(true)} disabled={running || !primary || !scenarioName}>
                <Save className="w-4 h-4 mr-1.5" /> Run &amp; save scenario
              </Button>
            </div>
            <Input placeholder="Scenario name (to save & compare)" value={scenarioName} onChange={(e) => setScenarioName(e.target.value)} />
          </CardContent>
        </Card>

        {/* ---------- results ---------- */}
        <div className="space-y-4">
          {running && <Skeleton className="h-72 rounded-lg" />}
          {!running && !result && (
            <Card>
              <CardContent>
                <EmptyState
                  icon={GitBranch}
                  title="No simulation yet"
                  description="Pick an activity, add a proposed change (room / time / date / faculty) and run the simulation. The engine compares the current schedule with the proposed scenario and reports conflicts resolved, conflicts created and everyone affected."
                />
              </CardContent>
            </Card>
          )}
          {result && <SimulationResults result={result} />}

          {/* saved scenarios */}
          {(scenarios?.scenarios.length ?? 0) > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Layers className="w-4 h-4 text-orange-600" /> Saved scenarios</CardTitle>
                <CardDescription className="text-xs">Compare alternatives; an administrator can apply one to the official schedule (engine re-validates first).</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {scenarios!.scenarios.map((s) => (
                  <div key={s.id} className="glass-panel glass-hover rounded-lg border p-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold flex items-center gap-2">
                        {s.name}
                        <span className={cn(
                          'text-[10px] px-1.5 py-0.5 rounded border',
                          s.result?.delta?.overallImpact === 'POSITIVE' ? 'border-emerald-300 text-emerald-700 bg-emerald-50' :
                          s.result?.delta?.overallImpact === 'NEGATIVE' ? 'border-red-300 text-red-700 bg-red-50' : 'border-slate-300 text-slate-600 bg-slate-50'
                        )}>
                          {s.result?.delta?.overallImpact} {s.result?.delta?.impactScore ?? 0}
                        </span>
                        {s.status === 'APPLIED' && <span className="text-[10px] text-emerald-700 border border-emerald-300 bg-emerald-50 rounded px-1.5 py-0.5">APPLIED</span>}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {s.result?.delta?.conflictsResolved.length ?? 0} resolved · {s.result?.delta?.conflictsCreated.length ?? 0} created · by {s.createdBy} · {new Date(s.createdAt).toLocaleString()}
                      </div>
                    </div>
                    {role === 'ADMIN' && s.status !== 'APPLIED' && (
                      <Button size="sm" className="h-7 bg-emerald-600 hover:bg-emerald-700 text-xs" onClick={() => apply.mutate(s.id)} disabled={apply.isPending}>
                        {apply.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <CheckCircle2 className="w-3 h-3 mr-1" />} Apply to official schedule
                      </Button>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function SimulationResults({ result }: { result: SimulationResult }) {
  const d = result.delta;
  const c = result.cascade;
  const tone = d.overallImpact === 'POSITIVE' ? 'text-emerald-700' : d.overallImpact === 'NEGATIVE' ? 'text-red-700' : 'text-muted-foreground';
  const ToneIcon = d.overallImpact === 'POSITIVE' ? TrendingUp : d.overallImpact === 'NEGATIVE' ? TrendingDown : Minus;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-sm">Simulation result — current vs proposed</CardTitle>
            <CardDescription className="text-xs">{d.summary}</CardDescription>
          </div>
          <div className={cn('flex items-center gap-2 text-2xl font-bold', tone)}>
            <ToneIcon className="w-5 h-5" />
            {d.impactScore >= 0 ? '+' : ''}{d.impactScore}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* resolved / created */}
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="glass-tint rounded-xl border border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/25 dark:border-emerald-900 p-3">
            <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase flex items-center gap-1.5 mb-2">
              <CheckCircle2 className="w-4 h-4" /> Conflicts resolved ({d.conflictsResolved.length})
            </div>
            {d.conflictsResolved.length === 0 ? (
              <div className="text-xs text-muted-foreground">None eliminated by this change.</div>
            ) : (
              d.conflictsResolved.map((r, i) => (
                <div key={i} className="text-xs text-muted-foreground mb-1 last:mb-0 line-clamp-2">
                  <span className="font-semibold text-emerald-700">{r.type.replace(/_/g, ' ')}</span> — {r.description}
                </div>
              ))
            )}
          </div>
          <div className={cn('glass-tint rounded-xl border p-3', d.conflictsCreated.length ? 'border-red-200 bg-red-50/50 dark:bg-red-950/25 dark:border-red-900' : 'border-slate-200')}>
            <div className="text-xs font-semibold text-red-700 dark:text-red-400 uppercase flex items-center gap-1.5 mb-2">
              <AlertTriangle className="w-4 h-4" /> New conflicts created ({d.conflictsCreated.length})
            </div>
            {d.conflictsCreated.length === 0 ? (
              <div className="text-xs text-muted-foreground">No new conflicts — clean change.</div>
            ) : (
              d.conflictsCreated.map((r, i) => (
                <div key={i} className="text-xs text-muted-foreground mb-1 last:mb-0 line-clamp-2">
                  <span className="font-semibold text-red-700">{r.type.replace(/_/g, ' ')}</span> — {r.description}
                </div>
              ))
            )}
          </div>
        </div>

        {/* affected */}
        <div className="grid sm:grid-cols-3 gap-3">
          <MiniStat icon={GraduationCap} label="Affected faculty" items={d.affectedFaculty} />
          <MiniStat icon={Users} label="Affected student groups" items={d.affectedStudentGroups} />
          <MiniStat icon={DoorOpen} label="Affected rooms" items={d.affectedRooms} />
        </div>

        {/* timetable changes */}
        {d.timetableChanges.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-muted-foreground uppercase mb-1.5 flex items-center gap-1.5"><ArrowRight className="w-3.5 h-3.5" /> Timetable changes</div>
            <div className="space-y-1">
              {d.timetableChanges.map((t, i) => (
                <div key={i} className="glass-well text-xs rounded border border-transparent p-2">
                  <span className="font-mono text-[10px] text-muted-foreground mr-2">{t.activityCode}</span>
                  {t.description}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* workload / capacity */}
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="glass-panel rounded-lg border p-3">
            <div className="text-xs font-semibold text-muted-foreground uppercase mb-1.5">Workload changes</div>
            {d.workloadChanges.length === 0 ? (
              <div className="text-xs text-muted-foreground">No faculty workload deltas.</div>
            ) : (
              d.workloadChanges.map((w, i) => (
                <div key={i} className="text-xs flex items-center gap-2">
                  <span className="font-medium">{w.facultyName}</span>
                  <span className="text-muted-foreground tabular-nums">{w.before}h</span>
                  <ArrowRight className="w-3 h-3" />
                  <span className="tabular-nums font-semibold">{w.after}h</span>
                </div>
              ))
            )}
          </div>
          <div className="glass-panel rounded-lg border p-3">
            <div className="text-xs font-semibold text-muted-foreground uppercase mb-1.5">Capacity changes (bookings per room)</div>
            {d.capacityChanges.length === 0 ? (
              <div className="text-xs text-muted-foreground">No room load changes.</div>
            ) : (
              d.capacityChanges.map((w, i) => (
                <div key={i} className="text-xs flex items-center gap-2">
                  <span className="font-mono">{w.roomCode}</span>
                  <span className="text-muted-foreground tabular-nums">{w.before}</span>
                  <ArrowRight className="w-3 h-3" />
                  <span className="tabular-nums font-semibold">{w.after}</span>
                  <span className="text-muted-foreground text-[10px]">({w.note})</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* cascade chain */}
        {c.chain.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-muted-foreground uppercase mb-1.5 flex items-center gap-1.5">
              <GitBranch className="w-3.5 h-3.5" /> Dependency chain (cascading analysis)
              {c.hasCascadingRisk && <span className="text-red-600 normal-case font-medium">— hard cascade risk detected</span>}
            </div>
            <div className="glass-well rounded-lg border border-transparent p-3 space-y-1.5 max-h-60 overflow-y-auto">
              {c.chain.map((n, i) => (
                <div key={i} className="flex gap-2 items-start text-xs">
                  <span className={cn(
                    'text-[9px] font-mono px-1.5 py-0.5 rounded border shrink-0',
                    n.level === 0 ? 'bg-orange-50 border-orange-300 text-orange-700' :
                    n.level === 1 ? 'bg-amber-50 border-amber-300 text-amber-700' :
                    'bg-red-50 border-red-300 text-red-700'
                  )}>L{n.level}</span>
                  <span className="text-muted-foreground"><b className="text-foreground">{n.resource}</b> — {n.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="text-[11px] text-muted-foreground flex items-center gap-2">
          <TypeBadge type="HARD" /> The engine validated this scenario on a copy of the full schedule — nothing has been applied to the official timetable.
        </div>
      </CardContent>
    </Card>
  );
}

function MiniStat({ icon: Icon, label, items }: { icon: React.ComponentType<{ className?: string }>; label: string; items: string[] }) {
  return (
    <div className="glass-panel rounded-lg border p-3">
      <div className="text-xs font-semibold text-muted-foreground uppercase mb-1 flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5" /> {label} ({items.length})
      </div>
      <div className="flex flex-wrap gap-1">
        {items.length === 0 ? <span className="text-[10px] text-muted-foreground">none</span> : items.map((i) => (
          <span key={i} className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded">{i}</span>
        ))}
      </div>
    </div>
  );
}
