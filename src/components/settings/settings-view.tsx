'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/ui-bits';
import { fetchRules, updateRules, fetchUsers, resetDemoData } from '@/lib/client-api';
import { useToast } from '@/hooks/use-toast';
import { formatMin } from '@/components/shared/ui-bits';
import { Settings, Save, ShieldCheck, Users, RotateCcw, AlertTriangle, Cog } from 'lucide-react';

const RULE_GROUPS: Array<{
  group: string;
  description: string;
  fields: Array<{ key: string; label: string; hint: string; kind: 'time' | 'number' | 'bool' | 'pct' }>;
}> = [
  {
    group: 'Teaching window',
    description: 'When classes may be scheduled (events are exempt)',
    fields: [
      { key: 'dayStartMin', label: 'Teaching day starts', hint: 'minutes from midnight', kind: 'time' },
      { key: 'dayEndMin', label: 'Teaching day ends', hint: 'minutes from midnight', kind: 'time' },
    ],
  },
  {
    group: 'Capacity policy',
    description: 'Room capacity enforcement',
    fields: [
      { key: 'capacityStrict', label: 'Strict capacity (hard conflict when room too small)', hint: 'off = warning only', kind: 'bool' },
      { key: 'capacityTolerancePct', label: 'Capacity tolerance', hint: 'soft warning threshold', kind: 'pct' },
    ],
  },
  {
    group: 'Faculty policy',
    description: 'Workload and break rules',
    fields: [
      { key: 'defaultMaxFacultyWeeklyHours', label: 'Default max weekly hours', hint: 'per faculty', kind: 'number' },
      { key: 'minBreakBetweenClasses', label: 'Min break between classes', hint: 'minutes', kind: 'number' },
      { key: 'maxConsecutiveClasses', label: 'Max consecutive classes', hint: 'soft violation above this', kind: 'number' },
    ],
  },
  {
    group: 'Student welfare',
    description: 'Timetable quality rules',
    fields: [
      { key: 'maxDailyGapHours', label: 'Max daily idle gap', hint: 'hours', kind: 'number' },
      { key: 'earlyClassStartMin', label: '"Early" threshold', hint: 'classes before this are flagged', kind: 'time' },
      { key: 'lateClassEndMin', label: '"Late" threshold', hint: 'classes after this are flagged', kind: 'time' },
    ],
  },
  {
    group: 'Room efficiency',
    description: 'Utilization analytics thresholds',
    fields: [
      { key: 'roomUtilizationThresholdPct', label: 'Room utilization threshold', hint: 'below = underutilized', kind: 'pct' },
      { key: 'largeRoomCapacity', label: 'Large room capacity', hint: 'seats', kind: 'number' },
      { key: 'largeRoomMinFillPct', label: 'Large room min fill', hint: 'below = wasted venue', kind: 'pct' },
    ],
  },
  {
    group: 'Movement & exams',
    description: 'Block movement and examination rules',
    fields: [
      { key: 'maxBlockMovesPerDay', label: 'Max block moves per day', hint: 'for student groups', kind: 'number' },
      { key: 'minGapBetweenExamsMin', label: 'Min gap between exams', hint: 'same group, same day', kind: 'number' },
      { key: 'examVenueStrict', label: 'Exams must use certified venues', hint: 'hard conflict otherwise', kind: 'bool' },
    ],
  },
];

export function SettingsView() {
  const { data, isLoading } = useQuery({ queryKey: ['rules'], queryFn: fetchRules });
  const { data: users } = useQuery({ queryKey: ['users'], queryFn: fetchUsers });
  const [override, setOverride] = useState<Record<string, unknown> | null>(null);
  const rules: Record<string, unknown> = override ?? data?.rules ?? {};
  const setField = (key: string, value: unknown) => setOverride({ ...rules, [key]: value });
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const save = useMutation({
    mutationFn: () => updateRules(rules as Record<string, number | boolean>),
    onSuccess: () => {
      setOverride(null);
      toast({ title: 'Rules saved', description: 'Re-run conflict detection to apply the new policy to existing records.' });
      queryClient.invalidateQueries({ queryKey: ['rules'] });
    },
    onError: (e: Error) => toast({ title: 'Save failed', description: e.message, variant: 'destructive' }),
  });

  const reset = useMutation({
    mutationFn: resetDemoData,
    onSuccess: (res) => {
      toast({ title: 'Demo data reset', description: `${res.summary.activities} activities, ${res.summary.conflicts} conflicts re-seeded.` });
      queryClient.invalidateQueries();
    },
    onError: (e: Error) => toast({ title: 'Reset failed', description: e.message, variant: 'destructive' }),
  });

  if (isLoading) return <Skeleton className="h-96 rounded-lg" />;

  return (
    <Tabs defaultValue="rules" className="space-y-4">
      <TabsList>
        <TabsTrigger value="rules" className="gap-1.5"><Cog className="w-4 h-4" /> Scheduling rules</TabsTrigger>
        <TabsTrigger value="users" className="gap-1.5"><Users className="w-4 h-4" /> Users &amp; roles</TabsTrigger>
        <TabsTrigger value="system" className="gap-1.5"><Settings className="w-4 h-4" /> System</TabsTrigger>
      </TabsList>

      <TabsContent value="rules" className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Configurable scheduling rules (LPU policy)</CardTitle>
            <CardDescription className="text-xs">
              These rules feed the deterministic engine — the constraint system evaluates them systematically on every scan.
              All 22 conflict types derive from this configuration.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {RULE_GROUPS.map((g) => (
              <div key={g.group} className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.group}</div>
                <div className="text-[11px] text-muted-foreground -mt-1">{g.description}</div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {g.fields.map((f) => {
                    const value = rules[f.key];
                    if (f.kind === 'bool') {
                      return (
                        <div key={f.key} className="rounded-lg border p-3 flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-medium">{f.label}</div>
                            <div className="text-[10px] text-muted-foreground">{f.hint}</div>
                          </div>
                          <Switch checked={Boolean(value)} onCheckedChange={(v) => setField(f.key, v)} />
                        </div>
                      );
                    }
                    return (
                      <div key={f.key} className="rounded-lg border p-3 space-y-1.5">
                        <Label className="text-xs">{f.label}</Label>
                        {f.kind === 'time' ? (
                          <Input
                            type="time"
                            value={formatMin(Number(value) || 0)}
                            onChange={(e) => {
                              const [h, m] = e.target.value.split(':').map(Number);
                              setField(f.key, (h || 0) * 60 + (m || 0));
                            }}
                          />
                        ) : (
                          <Input
                            type="number"
                            min={0}
                            value={Number(value) || 0}
                            suffix={f.kind === 'pct' ? '%' : undefined}
                            onChange={(e) => setField(f.key, Number(e.target.value))}
                          />
                        )}
                        <div className="text-[10px] text-muted-foreground">{f.hint}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            <div className="flex items-center gap-2 pt-2 border-t">
              <Button onClick={() => save.mutate()} disabled={save.isPending} className="bg-orange-600 hover:bg-orange-700">
                <Save className="w-4 h-4 mr-1.5" /> Save rule configuration
              </Button>
              <span className="text-[11px] text-muted-foreground">Saving writes an audit entry; re-run detection to rescan existing records.</span>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="users">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Users &amp; role-based access control</CardTitle>
            <CardDescription className="text-xs">Permissions are enforced server-side on every API route — not only in the UI.</CardDescription>
          </CardHeader>
          <CardContent>
            {!users || users.users.length === 0 ? (
              <EmptyState icon={Users} title="No users" description="User accounts appear here." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted">
                    <tr className="text-left">
                      {['Name', 'Email', 'Role', 'Scope', 'Status', 'Created'].map((h) => (
                        <th key={h} className="px-3 py-2 font-semibold border-b">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {users.users.map((u) => (
                      <tr key={u.id} className="border-b hover:bg-muted/50">
                        <td className="px-3 py-2 font-medium">{u.name}</td>
                        <td className="px-3 py-2 font-mono">{u.email}</td>
                        <td className="px-3 py-2">
                          <Badge variant="outline" className={
                            u.role === 'ADMIN' ? 'bg-red-50 text-red-700 border-red-300' :
                            u.role === 'SCHEDULER' ? 'bg-orange-50 text-orange-700 border-orange-300' :
                            u.role === 'FACULTY' ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : 'bg-slate-50 text-slate-600 border-slate-300'
                          }>
                            {u.role}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{u.title}</td>
                        <td className="px-3 py-2">{u.isActive ? 'Active' : 'Disabled'}</td>
                        <td className="px-3 py-2 text-muted-foreground">{new Date(u.createdAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-2 text-[11px]">
              <RoleCard role="ADMIN" capabilities="Everything: approve/reject, users, rules, reset, apply scenarios" />
              <RoleCard role="SCHEDULER" capabilities="Schedule CRUD, run AI analysis, simulate, reject recommendations" />
              <RoleCard role="FACULTY" capabilities="View own schedule, own conflicts, permitted recommendations (read-only)" />
              <RoleCard role="STUDENT" capabilities="Read-only own group timetable and relevant schedule info" />
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="system">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-emerald-600" /> System integrity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="space-y-2">
              <div className="flex gap-2"><ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /> AI can never write to the official timetable — changes only flow through the approval workflow.</div>
              <div className="flex gap-2"><ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /> Every applied change is re-validated against the current schedule before it is committed.</div>
              <div className="flex gap-2"><ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /> Full conflict re-detection runs after every create / update / delete / approval / scenario application.</div>
              <div className="flex gap-2"><ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /> Complete audit trail: before/after states, decisions, verification results.</div>
            </div>
            <div className="border-t pt-4">
              <div className="text-xs font-semibold uppercase text-muted-foreground mb-2 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Danger zone
              </div>
              <Button variant="outline" className="border-red-300 text-red-700 hover:bg-red-50" onClick={() => reset.mutate()} disabled={reset.isPending}>
                <RotateCcw className="w-4 h-4 mr-1.5" /> {reset.isPending ? 'Resetting…' : 'Reset demo data (re-seed sample dataset)'}
              </Button>
              <div className="text-[11px] text-muted-foreground mt-2">
                Wipes all schedules, conflicts, resolutions, simulations and audit entries, then re-seeds the LPU sample dataset. All sample identities are fictional.
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}

function RoleCard({ role, capabilities }: { role: string; capabilities: string }) {
  return (
    <div className="rounded-md border p-2.5">
      <div className="font-semibold text-[11px]">{role}</div>
      <div className="text-muted-foreground text-[10px] leading-snug mt-0.5">{capabilities}</div>
    </div>
  );
}
