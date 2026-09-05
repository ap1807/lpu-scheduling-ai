/**
 * Time / date helpers shared across the scheduling engine.
 * All times are minutes-from-midnight integers; all dates are ISO "YYYY-MM-DD".
 */
import { EngineActivity, UnavailabilitySlot } from './types';

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function minutesToHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function durationLabel(startMin: number, endMin: number): string {
  return `${minutesToHHMM(startMin)}–${minutesToHHMM(endMin)}`;
}

/** ISO date (YYYY-MM-DD) -> day-of-week 0..6 */
export function dayOfWeek(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function dateLabel(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return `${DAY_SHORT[dayOfWeek(isoDate)]} ${d} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m - 1]} ${y}`;
}

/** Monday of the week containing isoDate */
export function weekStart(isoDate: string): string {
  const dow = dayOfWeek(isoDate);
  const diff = dow === 0 ? -6 : 1 - dow; // treat Sunday as end of week
  return addDays(isoDate, diff);
}

export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function activityTimeLabel(a: EngineActivity): string {
  return `${a.date} ${durationLabel(a.startMin, a.endMin)}`;
}

export function activityLabel(a: EngineActivity): string {
  return `${a.courseCode} ${a.sectionCode} (${a.activityType}) ${durationLabel(a.startMin, a.endMin)} @ ${a.roomCode} — ${a.facultyName} [${a.studentGroupCode}]`;
}

/** Check if an activity collides with an unavailability window (weekly + date-specific). */
export function hitsUnavailability(
  date: string,
  day: number,
  startMin: number,
  endMin: number,
  slots: UnavailabilitySlot[]
): UnavailabilitySlot | null {
  for (const s of slots) {
    if (s.date && s.date !== date) continue;
    if (!s.date && s.day !== day) continue;
    if (overlaps(startMin, endMin, s.startMin, s.endMin)) return s;
  }
  return null;
}

export function uniqueSorted<T>(arr: T[]): T[] {
  return Array.from(new Set(arr)).sort();
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
