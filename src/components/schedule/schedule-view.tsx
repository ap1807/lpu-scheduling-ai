'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, TypeBadge, formatMin, dateLabel, DAY_SHORT } from '@/components/shared/ui-bits';
import { fetchActivities, fetchResources, type ActivityRow } from '@/lib/client-api';
import { useAppStore } from '@/store/app-store';
import { useToast } from '@/hooks/use-toast';
import { ActivityFormDialog } from './activity-form-dialog';
import { cn } from '@/lib/utils';
import { CalendarDays, Plus, Search, Table2, LayoutGrid, ChevronLeft, ChevronRight, Pencil, Copy, Trash2, AlertTriangle } from 'lucide-react';

const TYPE_COLORS: Record<string, string> = {
  CLASS: 'border-l-orange-500 bg-orange-50/70 dark:bg-orange-950/30',
  TUTORIAL: 'border-l-teal-500 bg-teal-50/70 dark:bg-teal-950/30',
  LAB: 'border-l-violet-500 bg-violet-50/70 dark:bg-violet-950/30',
  WORKSHOP: 'border-l-cyan-500 bg-cyan-50/70 dark:bg-cyan-950/30',
  SEMINAR: 'border-l-pink-500 bg-pink-50/70 dark:bg-pink-950/30',
  EXAM: 'border-l-red-500 bg-red-50/70 dark:bg-red-950/30',
  EVENT: 'border-l-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/30',
  OTHER: 'border-l-slate-400 bg-slate-50/70 dark:bg-slate-800/40',
};

export function ScheduleView() {
  const [tab, setTab] = useState('calendar');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [groupFilter, setGroupFilter] = useState('all');
  const [roomFilter, setRoomFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editActivity, setEditActivity] = useState<ActivityRow | null>(null);
  const [weekAnchor, setWeekAnchor] = useState(0);

  const role = (useSession().data?.user as { role?: string })?.role ?? 'STUDENT';
  const canEdit = role === 'ADMIN' || role === 'SCHEDULER';
  const navigate = useAppStore((s) => s.navigate);
  const params = useAppStore((s) => s.params);

  const { data, isLoading } = useQuery({
    queryKey: ['activities', { q: search, type: typeFilter, group: groupFilter, room: roomFilter, date: dateFilter }],
    queryFn: () => fetchActivities({ q: search || undefined, type: typeFilter !== 'all' ? typeFilter : undefined, group: groupFilter !== 'all' ? groupFilter : undefined, room: roomFilter !== 'all' ? roomFilter : undefined, date: dateFilter || undefined }),
  });
  const { data: resources } = useQuery({ queryKey: ['resources'], queryFn: fetchResources, staleTime: 300_000 });

  const activities = useMemo(() => data?.activities ?? [], [data]);

  // week calendar computation
  const dates = useMemo(() => {
    if (activities.length === 0) return [];
    const all = Array.from(new Set(activities.map((a) => a.date))).sort();
    const mondays: string[] = [];
    for (const d of all) {
      const [y, m, dd] = d.split('-').map(Number);
      const dow = new Date(Date.UTC(y, m - 1, dd)).getUTCDay();
      const monday = new Date(Date.UTC(y, m - 1, dd));
      monday.setUTCDate(monday.getUTCDate() - (dow === 0 ? -1 : dow - 1));
      const iso = monday.toISOString().slice(0, 10);
      if (!mondays.includes(iso)) mondays.push(iso);
    }
    mondays.sort();
    return mondays;
  }, [activities]);

  const anchorIdx = Math.min(Math.max(0, weekAnchor), Math.max(0, dates.length - 1));
  const weekMonday = dates[anchorIdx];
  const weekDates = useMemo(() => {
    if (!weekMonday) return [];
    const [y, m, d] = weekMonday.split('-').map(Number);
    return Array.from({ length: 7 }, (_, i) => {
      const dt = new Date(Date.UTC(y, m - 1, d));
      dt.setUTCDate(dt.getUTCDate() + i);
      return dt.toISOString().slice(0, 10);
    });
  }, [weekMonday]);

  const byDateRoom = useMemo(() => {
    const map = new Map<string, ActivityRow[]>();
    for (const a of activities) {
      const key = `${a.date}|${a.roomId}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    return map;
  }, [activities]);

  // day view
  const [dayIdx, setDayIdx] = useState(0);
  const dayOptions = useMemo(() => Array.from(new Set(activities.map((a) => a.date))).sort(), [activities]);
  const selectedDay = dayOptions[Math.min(dayIdx, Math.max(0, dayOptions.length - 1))] ?? '';
  const dayActivities = useMemo(() => activities.filter((a) => a.date === selectedDay).sort((a, b) => a.startMin - b.startMin), [activities, selectedDay]);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const dup = useMutation({
    mutationFn: (id: string) => import('@/lib/client-api').then((m) => m.duplicateActivity(id)),
    onSuccess: (res) => {
      toast({ title: 'Activity duplicated', description: `Post-duplicate engine scan: ${res.conflictsAfter} active conflicts` });
      queryClient.invalidateQueries({ queryKey: ['activities'] });
      queryClient.invalidateQueries({ queryKey: ['conflicts'] });
      queryClient.invalidateQueries({ queryKey: ['overview'] });
    },
    onError: (e: Error) => toast({ title: 'Duplicate failed', description: e.message, variant: 'destructive' }),
  });

  const del = useMutation({
    mutationFn: (id: string) => import('@/lib/client-api').then((m) => m.deleteActivity(id)),
    onSuccess: (res) => {
      toast({ title: 'Activity deleted', description: `Post-delete engine scan: ${res.conflictsAfter} active conflicts` });
      queryClient.invalidateQueries({ queryKey: ['activities'] });
      queryClient.invalidateQueries({ queryKey: ['conflicts'] });
      queryClient.invalidateQueries({ queryKey: ['overview'] });
    },
    onError: (e: Error) => toast({ title: 'Delete failed', description: e.message, variant: 'destructive' }),
  });

  const hours = Array.from({ length: 13 }, (_, i) => 8 + i); // 8:00 .. 20:00

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-96" />
        <Skeleton className="h-96 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search course, section, faculty, room, code…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {['CLASS', 'TUTORIAL', 'LAB', 'WORKSHOP', 'SEMINAR', 'EXAM', 'EVENT'].map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={groupFilter} onValueChange={setGroupFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Group" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All groups</SelectItem>
            {(resources?.studentGroups ?? []).map((g) => (
              <SelectItem key={g.id} value={g.id}>{g.code}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={roomFilter} onValueChange={setRoomFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Room" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All rooms</SelectItem>
            {(resources?.rooms ?? []).map((r) => (
              <SelectItem key={r.id} value={r.id}>{r.code}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="w-40" />
        {canEdit && (
          <Button
            className="bg-orange-600 hover:bg-orange-700"
            onClick={() => {
              setEditActivity(null);
              setFormOpen(true);
            }}
          >
            <Plus className="w-4 h-4 mr-1" /> New activity
          </Button>
        )}
        <div className="text-xs text-muted-foreground ml-auto">{data?.total ?? 0} records</div>
      </div>

      {params.activityId && <NavigateToActivityHint id={params.activityId} />}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="calendar" className="gap-1.5"><CalendarDays className="w-4 h-4" /> Calendar</TabsTrigger>
          <TabsTrigger value="timetable" className="gap-1.5"><LayoutGrid className="w-4 h-4" /> Day timetable</TabsTrigger>
          <TabsTrigger value="table" className="gap-1.5"><Table2 className="w-4 h-4" /> Table</TabsTrigger>
        </TabsList>

        {/* ---------- WEEK CALENDAR ---------- */}
        <TabsContent value="calendar">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm">
                    Week of {weekMonday ? dateLabel(weekMonday) : '—'}
                  </CardTitle>
                  <CardDescription className="text-xs">Rooms × time grid · week {anchorIdx + 1} of {dates.length || 1}</CardDescription>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon" onClick={() => setWeekAnchor(anchorIdx - 1)} disabled={anchorIdx <= 0} aria-label="Previous week">
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button variant="outline" size="icon" onClick={() => setWeekAnchor(anchorIdx + 1)} disabled={anchorIdx >= dates.length - 1} aria-label="Next week">
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {weekDates.length === 0 ? (
                <EmptyState icon={CalendarDays} title="No activities match the filters" description="Clear the search or filters to see the full schedule." />
              ) : (
                <div className="min-w-[840px]">
                  <div className="grid grid-cols-[70px_repeat(6,1fr)] gap-1 text-[10px] font-semibold text-muted-foreground mb-1">
                    <div />
                    {weekDates.slice(0, 6).map((d) => (
                      <div key={d} className="text-center py-1 rounded bg-muted/60">{dateLabel(d)}</div>
                    ))}
                  </div>
                  {hours.map((h) => (
                    <div key={h} className="grid grid-cols-[70px_repeat(6,1fr)] gap-1 mb-1">
                      <div className="text-[10px] text-muted-foreground text-right pr-1 pt-1 tabular-nums">{String(h).padStart(2, '0')}:00</div>
                      {weekDates.slice(0, 6).map((d) => {
                        const slots = activities.filter(
                          (a) => a.date === d && a.startMin < (h + 1) * 60 && a.endMin > h * 60 && a.startMin >= h * 60 && a.startMin < (h + 1) * 60
                        );
                        return (
                          <div key={d + h} className="min-h-10 rounded border-l-2 border-transparent glass-well hover:bg-muted/40 transition-colors duration-150 p-0.5 space-y-0.5">
                            {slots.map((a) => (
                              <ActivityChip key={a.id} a={a} canEdit={canEdit} onEdit={() => { setEditActivity(a); setFormOpen(true); }} onDuplicate={() => dup.mutate(a.id)} onDelete={() => del.mutate(a.id)} />
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------- DAY TIMETABLE ---------- */}
        <TabsContent value="timetable">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm">{selectedDay ? dateLabel(selectedDay) : 'No date'}</CardTitle>
                  <CardDescription className="text-xs">Full-day timetable · {dayActivities.length} activities</CardDescription>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon" onClick={() => setDayIdx(Math.max(0, dayIdx - 1))} disabled={dayIdx <= 0} aria-label="Previous day">
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Select value={selectedDay} onValueChange={(v) => setDayIdx(dayOptions.indexOf(v))}>
                    <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {dayOptions.map((d) => (
                        <SelectItem key={d} value={d}>{dateLabel(d)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="icon" onClick={() => setDayIdx(Math.min(dayOptions.length - 1, dayIdx + 1))} disabled={dayIdx >= dayOptions.length - 1} aria-label="Next day">
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {dayActivities.length === 0 ? (
                <EmptyState icon={CalendarDays} title="Nothing scheduled" description="No activities on this date (Sundays host university events only)." />
              ) : (
                <div className="space-y-1.5 max-h-[560px] overflow-y-auto overscroll-contain pr-1">
                  {dayActivities.map((a) => (
                    <div key={a.id} className={cn('rounded-md border border-l-4 p-3 flex flex-wrap items-center gap-x-4 gap-y-1', TYPE_COLORS[a.activityType] ?? TYPE_COLORS.OTHER)}>
                      <div className="font-mono text-xs tabular-nums text-muted-foreground w-24">{formatMin(a.startMin)}–{formatMin(a.endMin)}</div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">
                          {a.courseCode} · {a.courseName} <span className="text-muted-foreground font-normal">({a.sectionCode})</span>
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {a.roomCode} · {a.blockCode} · {a.facultyName} · {a.studentGroupCode} · {a.capacityRequired} seats
                        </div>
                      </div>
                      <div className="ml-auto flex items-center gap-1.5">
                        <TypeBadge type={a.activityType} />
                        {a.notes && <span className="text-[10px] text-muted-foreground max-w-48 truncate" title={a.notes}>📝 {a.notes}</span>}
                        {canEdit && (
                          <>
                            <Button variant="ghost" size="icon" onClick={() => { setEditActivity(a); setFormOpen(true); }} aria-label="Edit"><Pencil className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => dup.mutate(a.id)} aria-label="Duplicate"><Copy className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => del.mutate(a.id)} aria-label="Delete"><Trash2 className="w-3.5 h-3.5 text-red-500" /></Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------- TABLE ---------- */}
        <TabsContent value="table">
          <Card>
            <CardContent className="p-0">
              {activities.length === 0 ? (
                <EmptyState icon={Table2} title="No matching records" description="Adjust filters or create a new activity." />
              ) : (
                <div className="overflow-x-auto overflow-y-auto max-h-[640px] overscroll-contain">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-muted/90 backdrop-blur-md z-10">
                    <tr className="text-left">
                      {['Code', 'Date', 'Day', 'Time', 'Course', 'Section', 'Type', 'Room', 'Block', 'Faculty', 'Group', 'Seats', ''].map((h) => (
                        <th key={h} className="px-2.5 py-2 font-semibold whitespace-nowrap border-b">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activities.map((a) => (
                      <tr
                        key={a.id}
                        className="hover:bg-muted/50 border-b last:border-0 cursor-pointer transition-colors duration-150"
                        onClick={() => { setEditActivity(a); setFormOpen(true); }}
                      >
                        <td className="px-2.5 py-1.5 font-mono text-[10px] text-muted-foreground">{a.activityCode}</td>
                        <td className="px-2.5 py-1.5 whitespace-nowrap">{a.date}</td>
                        <td className="px-2.5 py-1.5">{DAY_SHORT[a.dayOfWeek]}</td>
                        <td className="px-2.5 py-1.5 font-mono tabular-nums whitespace-nowrap">{formatMin(a.startMin)}–{formatMin(a.endMin)}</td>
                        <td className="px-2.5 py-1.5 max-w-52 truncate" title={a.courseName}><span className="font-semibold">{a.courseCode}</span> {a.courseName}</td>
                        <td className="px-2.5 py-1.5">{a.sectionCode}</td>
                        <td className="px-2.5 py-1.5"><TypeBadge type={a.activityType} /></td>
                        <td className="px-2.5 py-1.5">{a.roomCode}</td>
                        <td className="px-2.5 py-1.5">{a.blockCode}</td>
                        <td className="px-2.5 py-1.5 max-w-40 truncate">{a.facultyName}</td>
                        <td className="px-2.5 py-1.5">{a.studentGroupCode}</td>
                        <td className="px-2.5 py-1.5 tabular-nums">{a.capacityRequired}</td>
                        <td className="px-2.5 py-1.5" onClick={(e) => e.stopPropagation()}>
                          {canEdit && (
                            <div className="flex gap-0.5">
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditActivity(a); setFormOpen(true); }} aria-label="Edit"><Pencil className="w-3 h-3" /></Button>
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => dup.mutate(a.id)} aria-label="Duplicate"><Copy className="w-3 h-3" /></Button>
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => del.mutate(a.id)} aria-label="Delete"><Trash2 className="w-3 h-3 text-red-500" /></Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {formOpen && (
        <ActivityFormDialog
          open={formOpen}
          onOpenChange={(o) => {
            setFormOpen(o);
            if (!o) setEditActivity(null);
          }}
          activity={editActivity}
        />
      )}

      <div className="text-[11px] text-muted-foreground">
        Schedule changes automatically trigger a full engine re-scan — new conflicts appear in the{' '}
        <button className="text-orange-600 underline-offset-2 hover:underline" onClick={() => navigate('conflicts')}>Conflict Center</button>.
      </div>
    </div>
  );
}

function ActivityChip({ a, canEdit, onEdit, onDuplicate, onDelete }: { a: ActivityRow; canEdit: boolean; onEdit: () => void; onDuplicate: () => void; onDelete: () => void }) {
  return (
    <div
      className={cn('rounded border-l-2 px-1.5 py-1 text-[10px] leading-tight cursor-pointer hover:shadow-sm transition-shadow duration-150', TYPE_COLORS[a.activityType] ?? TYPE_COLORS.OTHER)}
      onClick={onEdit}
      title={`${a.courseCode} ${a.sectionCode} · ${a.courseName}\n${formatMin(a.startMin)}–${formatMin(a.endMin)} · ${a.roomCode} (${a.blockCode})\n${a.facultyName} · ${a.studentGroupCode} · ${a.capacityRequired} seats${a.notes ? `\n📝 ${a.notes}` : ''}`}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="font-bold truncate">{a.courseCode}</span>
        <span className="text-muted-foreground tabular-nums shrink-0">{formatMin(a.startMin)}</span>
      </div>
      <div className="text-muted-foreground truncate">{a.sectionCode} · {a.roomCode}</div>
      {a.isDemoConflict && <AlertTriangle className="w-3 h-3 text-red-500 inline" />}
      {canEdit && (
        <div className="hidden group-hover:flex gap-1 mt-0.5">
          <button onClick={(e) => { e.stopPropagation(); onDuplicate(); }} className="text-muted-foreground hover:text-foreground" aria-label="Duplicate"><Copy className="w-3 h-3" /></button>
          <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="text-red-400 hover:text-red-600" aria-label="Delete"><Trash2 className="w-3 h-3" /></button>
        </div>
      )}
    </div>
  );
}

function NavigateToActivityHint({ id }: { id: string }) {
  return (
    <div className="glass-tint rounded-lg border border-orange-200 bg-orange-50 dark:bg-orange-950/40 dark:border-orange-900 px-3 py-2 text-xs text-orange-800 dark:text-orange-300 flex items-center gap-2">
      <AlertTriangle className="w-4 h-4" /> Activity context: {id} — see highlighted record above.
    </div>
  );
}
