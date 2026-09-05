'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { fetchResources, createActivity, updateActivity, type ActivityRow } from '@/lib/client-api';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { Save, AlertTriangle, Bot } from 'lucide-react';
import { formatMin, hhmm } from './time-utils';

const ACTIVITY_TYPES = ['CLASS', 'TUTORIAL', 'LAB', 'WORKSHOP', 'SEMINAR', 'EXAM', 'EVENT', 'OTHER'];

export function ActivityFormDialog({
  open,
  onOpenChange,
  activity,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activity: ActivityRow | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <ActivityForm
          key={activity?.id ?? 'new'}
          activity={activity}
          onDone={() => onOpenChange(false)}
        />
      )}
    </Dialog>
  );
}

function ActivityForm({ activity, onDone }: { activity: ActivityRow | null; onDone: () => void }) {
  const { data: resources } = useQuery({ queryKey: ['resources'], queryFn: fetchResources, staleTime: 300_000 });
  const [form, setForm] = useState(() => ({
    courseCode: activity?.courseCode ?? '',
    courseName: activity?.courseName ?? '',
    sectionCode: activity?.sectionCode ?? '',
    studentGroupId: activity?.studentGroupId ?? '',
    facultyId: activity?.facultyId ?? '',
    roomId: activity?.roomId ?? '',
    activityType: activity?.activityType ?? 'CLASS',
    date: activity?.date ?? new Date().toISOString().slice(0, 10),
    start: formatMin(activity?.startMin ?? 540),
    end: formatMin(activity?.endMin ?? 600),
    capacityRequired: activity?.capacityRequired ?? 0,
    notes: activity?.notes ?? '',
  }));
  const [useGroupSize, setUseGroupSize] = useState(!activity);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const startMin = hhmm(form.start);
  const endMin = hhmm(form.end);
  const room = resources?.rooms.find((r) => r.id === form.roomId);
  const group = resources?.studentGroups.find((g) => g.id === form.studentGroupId);
  const effectiveCapacity = useGroupSize ? (group?.size ?? 0) : Number(form.capacityRequired);

  // live warnings (mirrors engine rules — the engine remains the authority)
  const warnings: string[] = [];
  if (room && effectiveCapacity > room.capacity) warnings.push(`Capacity: ${effectiveCapacity} students exceed ${room.code} capacity ${room.capacity}`);
  if (room && form.activityType === 'LAB' && room.roomType !== 'LABORATORY') warnings.push(`Room type: LAB session requires a laboratory, ${room.code} is ${room.roomType}`);
  if (room && form.activityType === 'EXAM' && !room.isExamVenue) warnings.push(`Exam venue: ${room.code} is not a certified examination venue`);
  if (endMin <= startMin) warnings.push('Time: end must be after start');
  if (form.activityType !== 'EVENT' && (startMin < 480 || endMin > 1140)) warnings.push('Time window: outside 08:00–19:00 teaching window');

  const onSubmit = async () => {
    setError('');
    if (!form.courseCode || !form.courseName || !form.sectionCode || !form.studentGroupId || !form.facultyId || !form.roomId || !form.date) {
      setError('Please fill all required fields.');
      return;
    }
    if (endMin <= startMin) {
      setError('End time must be after start time.');
      return;
    }
    setSaving(true);
    const payload = {
      courseCode: form.courseCode,
      courseName: form.courseName,
      sectionCode: form.sectionCode,
      studentGroupId: form.studentGroupId,
      facultyId: form.facultyId,
      roomId: form.roomId,
      activityType: form.activityType,
      date: form.date,
      startMin,
      endMin,
      capacityRequired: effectiveCapacity,
      notes: form.notes,
    };
    try {
      const res = activity ? await updateActivity(activity.id, payload) : await createActivity(payload);
      toast({
        title: activity ? 'Activity updated' : 'Activity created',
        description: `Engine re-scan complete: ${res.conflictsAfter} active conflicts${activity && 'conflictsInvolvingThis' in res ? ` · ${(res as { conflictsInvolvingThis: number }).conflictsInvolvingThis} involve this record` : ''}.`,
      });
      queryClient.invalidateQueries({ queryKey: ['activities'] });
      queryClient.invalidateQueries({ queryKey: ['conflicts'] });
      queryClient.invalidateQueries({ queryKey: ['overview'] });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{activity ? `Edit ${activity.activityCode}` : 'Create activity'}</DialogTitle>
        <DialogDescription>
          {activity
            ? 'Changes are re-validated by the deterministic engine after saving.'
            : 'Realistic LPU scheduling information. The engine re-scans the full timetable after every save.'}
        </DialogDescription>
      </DialogHeader>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Course code *</Label>
          <Input
            value={form.courseCode}
            onChange={(e) => {
              const code = e.target.value.toUpperCase();
              const match = resources?.courses.find((c) => c.code === code);
              setForm({ ...form, courseCode: code, courseName: match && !form.courseName ? match.name : form.courseName });
            }}
            placeholder="CSE301"
            list="course-codes"
          />
          <datalist id="course-codes">
            {(resources?.courses ?? []).map((c) => (
              <option key={c.id} value={c.code}>{c.name}</option>
            ))}
          </datalist>
        </div>
        <div className="space-y-1.5">
          <Label>Course name *</Label>
          <Input value={form.courseName} onChange={(e) => setForm({ ...form, courseName: e.target.value })} placeholder="Database Management Systems" />
        </div>
        <div className="space-y-1.5">
          <Label>Section *</Label>
          <Input value={form.sectionCode} onChange={(e) => setForm({ ...form, sectionCode: e.target.value.toUpperCase() })} placeholder="CSE301-A" />
        </div>
        <div className="space-y-1.5">
          <Label>Activity type *</Label>
          <Select value={form.activityType} onValueChange={(v) => setForm({ ...form, activityType: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ACTIVITY_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Student group *</Label>
          <Select value={form.studentGroupId || undefined} onValueChange={(v) => setForm({ ...form, studentGroupId: v })}>
            <SelectTrigger><SelectValue placeholder="Select group" /></SelectTrigger>
            <SelectContent>
              {(resources?.studentGroups ?? []).map((g) => (
                <SelectItem key={g.id} value={g.id}>{g.code} — {g.name} ({g.size})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Faculty *</Label>
          <Select value={form.facultyId || undefined} onValueChange={(v) => setForm({ ...form, facultyId: v })}>
            <SelectTrigger><SelectValue placeholder="Select faculty" /></SelectTrigger>
            <SelectContent>
              {(resources?.faculty ?? []).map((f) => (
                <SelectItem key={f.id} value={f.id}>{f.name} · {f.designation}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Room / laboratory *</Label>
          <Select value={form.roomId || undefined} onValueChange={(v) => setForm({ ...form, roomId: v })}>
            <SelectTrigger><SelectValue placeholder="Select room" /></SelectTrigger>
            <SelectContent>
              {(resources?.rooms ?? []).map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.code} — {r.name} ({r.roomType}, {r.capacity}{r.isExamVenue ? ', exam venue' : ''})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Date *</Label>
          <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Start time *</Label>
          <Input type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>End time *</Label>
          <Input type="time" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <div className="flex items-center justify-between">
            <Label>Capacity requirement</Label>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Switch checked={useGroupSize} onCheckedChange={setUseGroupSize} id="group-size" />
              <label htmlFor="group-size">Use group size{group ? ` (${group.size})` : ''}</label>
            </div>
          </div>
          <Input
            type="number"
            min={0}
            value={effectiveCapacity}
            disabled={useGroupSize}
            onChange={(e) => setForm({ ...form, capacityRequired: Number(e.target.value) })}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Notes</Label>
          <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional context (e.g. session origin, special requirements)" rows={2} />
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-900 p-3 space-y-1">
          <div className="text-xs font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4" /> Engine rule preview — saving will register a conflict
          </div>
          {warnings.map((w) => (
            <div key={w} className="text-xs text-amber-800 dark:text-amber-300">• {w}</div>
          ))}
        </div>
      )}

      {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">{error}</div>}

      <DialogFooter className="gap-2">
        <div className="text-[11px] text-muted-foreground mr-auto flex items-center gap-1.5">
          <Bot className="w-3.5 h-3.5 text-orange-600" />
          Deterministic engine validates every save — AI never writes to the timetable.
        </div>
        <Button variant="outline" onClick={onDone}>Cancel</Button>
        <Button onClick={onSubmit} className="bg-orange-600 hover:bg-orange-700" disabled={saving}>
          <Save className="w-4 h-4 mr-1.5" /> {saving ? 'Saving…' : activity ? 'Save changes' : 'Create activity'}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
