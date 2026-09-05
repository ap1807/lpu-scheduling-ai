'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { AlertTriangle, CircleAlert, Info, CircleMinus } from 'lucide-react';

export function SeverityBadge({ severity, className }: { severity: string; className?: string }) {
  const map: Record<string, { cls: string; icon: React.ReactNode }> = {
    CRITICAL: { cls: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-900', icon: <AlertTriangle className="w-3 h-3" /> },
    HIGH: { cls: 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-900', icon: <CircleAlert className="w-3 h-3" /> },
    MEDIUM: { cls: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-900', icon: <Info className="w-3 h-3" /> },
    LOW: { cls: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700', icon: <CircleMinus className="w-3 h-3" /> },
  };
  const m = map[severity] ?? map.LOW;
  return (
    <Badge variant="outline" className={cn('gap-1 text-[11px] font-semibold', m.cls, className)}>
      {m.icon}
      {severity}
    </Badge>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    OPEN: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300',
    ANALYZED: 'bg-blue-50 text-slate-700 border-slate-200',
    RESOLUTION_PENDING: 'bg-amber-50 text-amber-800 border-amber-200',
    AWAITING_APPROVAL: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300',
    RESOLVED: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300',
    APPLIED: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300',
    APPROVED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    REJECTED: 'bg-slate-50 text-slate-600 border-slate-200',
    DISMISSED: 'bg-slate-50 text-slate-600 border-slate-200',
    FAILED: 'bg-red-50 text-red-700 border-red-200',
    INVALID: 'bg-red-50 text-red-700 border-red-200',
    VALIDATED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    SELECTED: 'bg-orange-50 text-orange-700 border-orange-200',
  };
  return (
    <Badge variant="outline" className={cn('text-[11px] whitespace-nowrap', map[status] ?? 'bg-slate-50 text-slate-600')}>
      {status.replace(/_/g, ' ')}
    </Badge>
  );
}

export function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    CLASS: 'bg-orange-50 text-orange-700 border-orange-200',
    TUTORIAL: 'bg-teal-50 text-teal-700 border-teal-200',
    LAB: 'bg-violet-50 text-violet-700 border-violet-200',
    WORKSHOP: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    SEMINAR: 'bg-pink-50 text-pink-700 border-pink-200',
    EXAM: 'bg-red-50 text-red-700 border-red-200',
    EVENT: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    OTHER: 'bg-slate-50 text-slate-700 border-slate-200',
    HARD: 'bg-red-50 text-red-700 border-red-200',
    SOFT: 'bg-amber-50 text-amber-700 border-amber-200',
  };
  return (
    <Badge variant="outline" className={cn('text-[11px] whitespace-nowrap', colors[type] ?? 'bg-slate-50 text-slate-700')}>
      {type.replace(/_/g, ' ')}
    </Badge>
  );
}

export function ActorBadge({ actor }: { actor: string }) {
  const map: Record<string, string> = {
    ENGINE: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300',
    AGENT: 'bg-orange-100 text-orange-700 border-orange-300',
    HUMAN: 'bg-emerald-100 text-emerald-700 border-emerald-300',
  };
  return (
    <Badge variant="outline" className={cn('text-[10px] font-mono', map[actor] ?? 'bg-slate-100')}>
      {actor === 'ENGINE' ? '⚙ ENGINE' : actor === 'AGENT' ? '🤖 AI AGENT' : '👤 HUMAN'}
    </Badge>
  );
}

export function EmptyState({ icon: Icon, title, description, action }: { icon: React.ComponentType<{ className?: string }>; title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
        <Icon className="w-6 h-6 text-muted-foreground" />
      </div>
      <div className="font-semibold">{title}</div>
      <div className="text-sm text-muted-foreground mt-1 max-w-md">{description}</div>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function KpiCard({ label, value, icon: Icon, tone, hint }: { label: string; value: string | number; icon: React.ComponentType<{ className?: string }>; tone?: 'orange' | 'red' | 'green' | 'slate' | 'amber' | 'violet'; hint?: string }) {
  const tones: Record<string, string> = {
    orange: 'text-orange-600 bg-orange-50 dark:bg-orange-950/40',
    red: 'text-red-600 bg-red-50 dark:bg-red-950/40',
    green: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40',
    slate: 'text-slate-600 bg-slate-100 dark:bg-slate-800',
    amber: 'text-amber-600 bg-amber-50 dark:bg-amber-950/40',
    violet: 'text-violet-600 bg-violet-50 dark:bg-violet-950/40',
  };
  return (
    <div className="rounded-lg border bg-card p-4 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground truncate">{label}</span>
        <div className={cn('w-7 h-7 rounded-md flex items-center justify-center shrink-0', tones[tone ?? 'slate'])}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className="text-2xl font-bold mt-1 tabular-nums">{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{hint}</div>}
    </div>
  );
}

export function formatMin(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function dateLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${DAY_SHORT[dow]} ${d} ${months[m - 1]}`;
}
