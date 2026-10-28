'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/ui-bits';
import { fetchAudit } from '@/lib/client-api';
import { cn } from '@/lib/utils';
import { ScrollText, Search, ChevronDown, Database, ShieldCheck, Bot, UserCheck, Wrench, Cog } from 'lucide-react';

const ACTION_META: Record<string, { icon: React.ComponentType<{ className?: string }>; cls: string; label: string }> = {
  SEED: { icon: Database, cls: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-300', label: 'Seed' },
  SCHEDULE_CREATED: { icon: Wrench, cls: 'bg-orange-50 text-orange-700 border-orange-300', label: 'Schedule created' },
  SCHEDULE_UPDATED: { icon: Wrench, cls: 'bg-orange-50 text-orange-700 border-orange-300', label: 'Schedule updated' },
  SCHEDULE_DELETED: { icon: Wrench, cls: 'bg-red-50 text-red-700 border-red-300', label: 'Schedule deleted' },
  CONFLICT_DETECTION_RERUN: { icon: Cog, cls: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300', label: 'Detection re-run' },
  AI_ANALYSIS_GENERATED: { icon: Bot, cls: 'bg-orange-50 text-orange-700 border-orange-300', label: 'AI analysis' },
  SOLUTION_APPROVED: { icon: UserCheck, cls: 'bg-emerald-50 text-emerald-700 border-emerald-300', label: 'Approved' },
  SOLUTION_REJECTED: { icon: UserCheck, cls: 'bg-slate-50 text-slate-600 border-slate-300', label: 'Rejected' },
  CHANGE_APPLIED: { icon: ShieldCheck, cls: 'bg-emerald-50 text-emerald-700 border-emerald-300', label: 'Change applied' },
  SIMULATION_CREATED: { icon: ScrollText, cls: 'bg-violet-50 text-violet-700 border-violet-300', label: 'Simulation' },
  SIMULATION_APPLIED: { icon: ShieldCheck, cls: 'bg-emerald-50 text-emerald-700 border-emerald-300', label: 'Scenario applied' },
  RULES_UPDATED: { icon: Cog, cls: 'bg-amber-50 text-amber-700 border-amber-300', label: 'Rules updated' },
};

export function AuditView() {
  const [search, setSearch] = useState('');
  const [action, setAction] = useState('all');

  const { data, isLoading } = useQuery({
    queryKey: ['audit', { q: search, action }],
    queryFn: () => fetchAudit({ q: search || undefined, action: action !== 'all' ? action : undefined }),
    refetchInterval: 20_000,
  });

  const logs = useMemo(() => data?.logs ?? [], [data]);
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search audit entries — actor, conflict, summary…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
        </div>
        <Select value={action} onValueChange={setAction}>
          <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            {Object.entries(ACTION_META).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}</div>
      ) : logs.length === 0 ? (
        <EmptyState icon={ScrollText} title="No audit entries yet" description="Operations like schedule edits, AI analyses, approvals and applications will appear here." />
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Complete operation history ({logs.length} entries)</CardTitle>
            <CardDescription className="text-xs">
              Every important scheduling operation records the original state, conflict, analysis, decisions, applied changes and post-change verification.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[calc(100vh-300px)] overflow-y-auto">
            {logs.map((l) => {
              const meta = ACTION_META[l.action] ?? { icon: ScrollText, cls: 'bg-slate-100 text-slate-600 border-slate-300', label: l.action };
              const isOpen = expanded === l.id;
              let details: unknown = null;
              try {
                details = JSON.parse(l.details);
              } catch {
                details = null;
              }
              return (
                <div key={l.id} className={cn('glass-panel rounded-xl border p-3 transition', isOpen && 'border-orange-300')}>
                  <button className="w-full flex items-start gap-3 text-left" onClick={() => setExpanded(isOpen ? null : l.id)}>
                    <div className={cn('w-8 h-8 rounded-md border flex items-center justify-center shrink-0', meta.cls)}>
                      <meta.icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={cn('text-[10px]', meta.cls)}>{meta.label}</Badge>
                        <span className="font-mono text-[10px] text-muted-foreground">{l.code}</span>
                        {l.conflictCode && <Badge variant="outline" className="text-[10px] font-mono">{l.conflictCode}</Badge>}
                      </div>
                      <div className="text-sm mt-1 leading-snug">{l.summary}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {l.actorName} ({l.actorRole}) · {new Date(l.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform shrink-0 mt-1', isOpen && 'rotate-180')} />
                  </button>
                  {isOpen && details !== null && (
                    <pre className="glass-well mt-2 text-[10px] whitespace-pre-wrap font-mono rounded-md p-3 max-h-80 overflow-y-auto leading-relaxed">
                      {JSON.stringify(details, null, 2).slice(0, 6000)}
                    </pre>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
