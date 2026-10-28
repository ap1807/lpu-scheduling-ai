'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { KpiCard, EmptyState } from '@/components/shared/ui-bits';
import { fetchOverview } from '@/lib/client-api';
import { useAppStore } from '@/store/app-store';
import { runDetection } from '@/lib/client-api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { useToast } from '@/hooks/use-toast';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell,
  LineChart, Line, AreaChart, Area, RadialBarChart, RadialBar, Legend,
} from 'recharts';
import {
  BookOpen, Users, GraduationCap, DoorOpen, FlaskConical, ClipboardCheck, CalendarDays, FileCheck2, PartyPopper,
  AlertTriangle, Flame, CheckCircle2, Clock, HeartPulse, Layers, RefreshCw, Building2, TrendingUp,
} from 'lucide-react';

const ORANGE = '#ea580c';
const AMBER = '#f59e0b';
const RED = '#dc2626';
const SLATE = '#94a3b8';
const EMERALD = '#10b981';
const VIOLET = '#8b5cf6';
const TEAL = '#14b8a6';

export function DashboardView() {
  const { data, isLoading, error } = useQuery({ queryKey: ['overview'], queryFn: fetchOverview, refetchInterval: 60_000 });
  const navigate = useAppStore((s) => s.navigate);
  const role = (useSession().data?.user as { role?: string })?.role ?? 'STUDENT';
  const canDetect = role === 'ADMIN' || role === 'SCHEDULER';
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const detect = useMutation({
    mutationFn: runDetection,
    onSuccess: (res) => {
      toast({ title: 'Conflict re-detection complete', description: `${res.total} active conflicts — ${res.critical} critical, ${res.high} high` });
      queryClient.invalidateQueries({ queryKey: ['overview'] });
      queryClient.invalidateQueries({ queryKey: ['conflicts'] });
    },
    onError: (e: Error) => toast({ title: 'Detection failed', description: e.message, variant: 'destructive' }),
  });

  if (isLoading) return <DashboardSkeleton />;
  if (error || !data) return <EmptyState icon={AlertTriangle} title="Could not load dashboard" description={error instanceof Error ? error.message : 'Unknown error'} />;

  const k = data.kpis;
  const a = data.analytics;
  const severityColors: Record<string, string> = { Critical: RED, High: ORANGE, Medium: AMBER, Low: SLATE };

  return (
    <div className="space-y-6">
      {/* header row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm text-muted-foreground">
            {data.scope.label} · schedule window {data.window.start} → {data.window.end}
          </div>
        </div>
        {canDetect && (
          <button
            onClick={() => detect.mutate()}
            disabled={detect.isPending}
            className="inline-flex items-center gap-2 rounded-lg border glass-chip px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${detect.isPending ? 'animate-spin' : ''}`} />
            {detect.isPending ? 'Re-running engine scan…' : 'Re-run conflict detection'}
          </button>
        )}
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
        <KpiCard label="Total courses" value={k.totalCourses} icon={BookOpen} tone="orange" />
        <KpiCard label="Active sections" value={k.activeSections} icon={Layers} tone="orange" />
        <KpiCard label="Faculty members" value={k.facultyMembers} icon={GraduationCap} tone="violet" />
        <KpiCard label="Classrooms" value={k.classrooms} icon={DoorOpen} tone="slate" />
        <KpiCard label="Laboratories" value={k.laboratories} icon={FlaskConical} tone="slate" />
        <KpiCard label="Exam venues" value={k.examRooms} icon={ClipboardCheck} tone="slate" />
        <KpiCard label="Scheduled classes" value={k.scheduledClasses} icon={CalendarDays} tone="green" hint={`${k.totalActivities} total records`} />
        <KpiCard label="Examinations" value={k.examinations} icon={FileCheck2} tone="red" hint={`${a.exam.examConflicts} exam conflicts`} />
        <KpiCard label="University events" value={k.events} icon={PartyPopper} tone="green" />
        <KpiCard label="Active conflicts" value={k.activeConflicts} icon={AlertTriangle} tone="amber" hint={`${k.highConflicts} high severity`} />
        <KpiCard label="Critical conflicts" value={k.criticalConflicts} icon={Flame} tone="red" />
        <KpiCard label="Resolved conflicts" value={k.resolvedConflicts} icon={CheckCircle2} tone="green" />
        <KpiCard label="Pending AI recommendations" value={k.pendingRecommendations} icon={Clock} tone="amber" hint={`${a.resolutionStats.approved} applied · ${a.resolutionStats.rejected} rejected`} />
        <KpiCard label="Schedule health" value={`${k.scheduleHealth}%`} icon={HeartPulse} tone={k.scheduleHealth > 80 ? 'green' : k.scheduleHealth > 60 ? 'amber' : 'red'} />
      </div>

      <Tabs defaultValue="conflicts">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="conflicts">Conflict Analytics</TabsTrigger>
          <TabsTrigger value="utilization">Room &amp; Lab Utilization</TabsTrigger>
          <TabsTrigger value="workload">Faculty Workload</TabsTrigger>
          <TabsTrigger value="timetable">Timetable Distribution</TabsTrigger>
          <TabsTrigger value="exams">Examinations</TabsTrigger>
        </TabsList>

        <TabsContent value="conflicts" className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Conflicts by severity</CardTitle>
                <CardDescription className="text-xs">Priority mix across the active window</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={a.conflictsBySeverity} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={2}>
                      {a.conflictsBySeverity.map((e) => (
                        <Cell key={e.name} fill={severityColors[e.name] ?? SLATE} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Conflicts by type</CardTitle>
                <CardDescription className="text-xs">Detected by the deterministic engine (hard &amp; soft)</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={a.conflictsByType.slice(0, 10)} layout="vertical" margin={{ left: 150, right: 10, top: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" fontSize={10} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" fontSize={10} width={150} tickFormatter={(v: string) => v.replace(/_/g, ' ').toLowerCase()} />
                    <Tooltip content={<ChartTip />} />
                    <Bar dataKey="value" fill={ORANGE} radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Conflicts by academic school</CardTitle>
                <CardDescription className="text-xs">Which schools are affected</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={a.conflictsBySchool} margin={{ left: -10, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" fontSize={10} />
                    <YAxis fontSize={10} allowDecimals={false} />
                    <Tooltip content={<ChartTip />} />
                    <Bar dataKey="value" fill={TEAL} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Conflicts by academic block</CardTitle>
                <CardDescription className="text-xs">Building-level hotspots</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={a.conflictsByBlock} margin={{ left: -10, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" fontSize={10} />
                    <YAxis fontSize={10} allowDecimals={false} />
                    <Tooltip content={<ChartTip />} />
                    <Bar dataKey="value" fill={VIOLET} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Conflicts by date</CardTitle>
                <CardDescription className="text-xs">Where the trouble concentrates in the window</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={a.conflictsByDate} margin={{ left: -15, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" fontSize={9} tickFormatter={(v: string) => v.slice(5)} />
                    <YAxis fontSize={10} allowDecimals={false} />
                    <Tooltip content={<ChartTip />} />
                    <Area type="monotone" dataKey="value" stroke={RED} fill={RED} fillOpacity={0.15} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Resolution statistics</CardTitle>
                <CardDescription className="text-xs">AI recommendation pipeline outcomes</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <RadialBarChart
                    data={[
                      { name: 'Awaiting approval', value: Math.max(4, a.resolutionStats.awaiting), fill: AMBER },
                      { name: 'Approved & applied', value: Math.max(4, a.resolutionStats.approved), fill: EMERALD },
                      { name: 'Rejected', value: Math.max(4, a.resolutionStats.rejected), fill: SLATE },
                    ]}
                    innerRadius="30%"
                    outerRadius="100%"
                    startAngle={180}
                    endAngle={-45}
                  >
                    <RadialBar dataKey="value" background cornerRadius={4} />
                    <Legend wrapperStyle={{ fontSize: 10 }} iconSize={8} />
                    <Tooltip content={<ChartTip />} />
                  </RadialBarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <button
            onClick={() => navigate('conflicts')}
            className="w-full rounded-xl glass-panel border border-dashed p-4 text-sm text-muted-foreground hover:border-orange-400 hover:text-foreground transition flex items-center justify-center gap-2"
          >
            <AlertTriangle className="w-4 h-4 text-orange-600" /> Open the LPU Conflict Center to investigate {k.activeConflicts} active conflicts
          </button>
        </TabsContent>

        <TabsContent value="utilization" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Classroom utilization (% of teaching window)</CardTitle>
                <CardDescription className="text-xs">Top 16 classrooms by occupancy · avg capacity fill {a.capacityUtilization.avgFill}%</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={a.classroomUtilization} margin={{ left: -18, right: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="code" fontSize={9} angle={-30} textAnchor="end" height={50} />
                    <YAxis fontSize={10} unit="%" />
                    <Tooltip content={<ChartTip labelSuffix="%" />} />
                    <Bar dataKey="pct" name="utilization" fill={ORANGE} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Laboratory utilization</CardTitle>
                <CardDescription className="text-xs">All laboratories · idle labs flagged by engine</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={a.labUtilization} margin={{ left: -18, right: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="code" fontSize={9} angle={-30} textAnchor="end" height={50} />
                    <YAxis fontSize={10} unit="%" />
                    <Tooltip content={<ChartTip labelSuffix="%" />} />
                    <Bar dataKey="pct" name="utilization" fill={VIOLET} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <InfoTile label="Avg classroom capacity fill" value={`${a.capacityUtilization.avgFill}%`} icon={TrendingUp} />
            <InfoTile label="Overfull bookings (capacity exceeded)" value={a.capacityUtilization.overfull} icon={AlertTriangle} />
            <InfoTile label="Classrooms + labs + exam venues" value={`${k.classrooms + k.laboratories + k.examRooms} rooms · ${k.academicBlocks} blocks`} icon={Building2} />
          </div>
        </TabsContent>

        <TabsContent value="workload" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Faculty weekly teaching hours (top 14)</CardTitle>
              <CardDescription className="text-xs">Policy limit shown per faculty · overload conflicts highlighted</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={a.facultyWorkload} margin={{ left: -22, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" fontSize={9} angle={-30} textAnchor="end" height={70} tickFormatter={(v: string) => v.replace(/^Dr\.?\s|^Prof\.?\s|^Mr\.?\s|^Chef\s/, '')} />
                  <YAxis fontSize={10} unit="h" />
                  <Tooltip content={<ChartTip labelSuffix="h" />} />
                  <Bar dataKey="hours" name="scheduled hours" radius={[3, 3, 0, 0]}>
                    {a.facultyWorkload.map((f, i) => (
                      <Cell key={i} fill={f.hours > f.max ? RED : f.hours > f.max * 0.8 ? AMBER : TEAL} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="timetable" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Classes by day of week</CardTitle>
                <CardDescription className="text-xs">Mon–Sat teaching, Sunday reserved for events</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={a.timetableByDay} margin={{ left: -18, right: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" fontSize={10} />
                    <YAxis fontSize={10} allowDecimals={false} />
                    <Tooltip content={<ChartTip />} />
                    <Bar dataKey="classes" fill={ORANGE} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Classes by start hour</CardTitle>
                <CardDescription className="text-xs">Daily load distribution across the teaching window</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={a.timetableByHour} margin={{ left: -18, right: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" fontSize={10} />
                    <YAxis fontSize={10} allowDecimals={false} />
                    <Tooltip content={<ChartTip />} />
                    <Line type="monotone" dataKey="classes" stroke={TEAL} strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="exams" className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-3">
            <InfoTile label="Scheduled examinations" value={a.exam.totalExams} icon={FileCheck2} />
            <InfoTile label="Exam-related conflicts" value={a.exam.examConflicts} icon={AlertTriangle} />
            <InfoTile label="Exam dates" value={`${a.exam.dates.length} days`} icon={CalendarDays} hint={a.exam.dates.join(' · ')} />
          </div>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Examination conflict types</CardTitle>
              <CardDescription className="text-xs">Group overlaps, venue incompatibility, spacing violations</CardDescription>
            </CardHeader>
            <CardContent>
              {a.exam.byType.length === 0 ? (
                <EmptyState icon={CheckCircle2} title="No examination conflicts" description="All exams are in valid venues with correct spacing." />
              ) : (
                <div className="flex flex-wrap gap-2">
                  {a.exam.byType.map((t, i) => (
                    <span key={i} className="rounded-md border border-red-200 bg-red-50 dark:bg-red-950/40 dark:border-red-900 px-2 py-1 text-xs text-red-700 dark:text-red-300">
                      {t.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function InfoTile({ label, value, icon: Icon, hint }: { label: string; value: string | number; icon: React.ComponentType<{ className?: string }>; hint?: string }) {
  return (
    <div className="rounded-xl border glass-panel p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-md bg-orange-50 dark:bg-orange-950/40 text-orange-600 flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <div className="text-lg font-bold tabular-nums">{value}</div>
        <div className="text-xs text-muted-foreground truncate">{label}</div>
        {hint && <div className="text-[10px] text-muted-foreground truncate">{hint}</div>}
      </div>
    </div>
  );
}

function ChartTip({ active, payload, label, labelSuffix }: { active?: boolean; payload?: Array<{ name?: string; value?: number | string }>; label?: string; labelSuffix?: string }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="glass-float relative rounded-lg border px-3 py-1.5 text-xs">
      <div className="font-medium">{label ?? payload[0]?.name}</div>
      {payload.map((p, i) => (
        <div key={i} className="text-muted-foreground">
          {p.name}: {p.value}{labelSuffix}
        </div>
      ))}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        {Array.from({ length: 14 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-8 w-64" />
      <div className="grid md:grid-cols-3 gap-4">
        <Skeleton className="h-72 rounded-lg" />
        <Skeleton className="h-72 rounded-lg md:col-span-2" />
      </div>
    </div>
  );
}
