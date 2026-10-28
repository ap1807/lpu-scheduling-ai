'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { SeverityBadge, StatusBadge, TypeBadge, ActorBadge, EmptyState } from '@/components/shared/ui-bits';
import { fetchConflictDetail, runResolutionAgent, decideResolution, type ConflictListRow, type ConflictDetail as CD } from '@/lib/client-api';
import { useAppStore } from '@/store/app-store';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  ArrowLeft, Bot, Cog, UserCheck, ChevronDown, Loader2, Sparkles, ShieldCheck, XCircle,
  CheckCircle2, GitBranch, AlertTriangle, FileSearch, Wrench, ListChecks, Trophy, BrainCircuit, History,
} from 'lucide-react';

const STAGE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  understanding: FileSearch,
  identification: Cog,
  'root-cause': BrainCircuit,
  impact: GitBranch,
  planning: Wrench,
  candidates: Sparkles,
  validation: ShieldCheck,
  scoring: Trophy,
  explanation: Bot,
  approval: UserCheck,
};

export function ConflictDetail({ conflict, onBack, onChanged }: { conflict: ConflictListRow; onBack: () => void; onChanged: () => void }) {
  const { data, isLoading, refetch } = useQuery({ queryKey: ['conflict', conflict.id], queryFn: () => fetchConflictDetail(conflict.id), enabled: !conflict.id.startsWith('live-') });
  const [running, setRunning] = useState(false);
  const [note, setNote] = useState('');
  const role = (useSession().data?.user as { role?: string })?.role ?? 'STUDENT';
  const canAnalyze = role === 'ADMIN' || role === 'SCHEDULER';
  const canApprove = role === 'ADMIN';
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const navigate = useAppStore((s) => s.navigate);

  const agent = useMutation({
    mutationFn: () => runResolutionAgent(conflict.id),
    onSuccess: () => {
      toast({ title: 'Agentic AI analysis complete', description: 'Candidates validated by the engine and awaiting human approval.' });
      refetch();
      queryClient.invalidateQueries({ queryKey: ['overview'] });
      onChanged();
    },
    onError: (e: Error) => toast({ title: 'Analysis failed', description: e.message, variant: 'destructive' }),
  });

  const decide = async (d: 'APPROVE' | 'REJECT', requestId: string, candidateId?: string) => {
    try {
      const res = await decideResolution(requestId, d, candidateId, note);
      if (d === 'APPROVE' && res.applied && res.verification) {
        toast({
          title: 'Change applied to the official timetable',
          description: `Post-change verification: original conflict ${res.verification.originalConflictResolved ? 'RESOLVED ✓' : 'STILL PRESENT'} · ${res.verification.newConflictsIntroduced.length} new conflict(s) · ${res.verification.postDetection.total} total.`,
        });
      } else if (d === 'REJECT') {
        toast({ title: 'Recommendation rejected', description: 'No changes were applied to the timetable.' });
      } else if (!res.applied) {
        toast({ title: 'Application blocked', description: res.reason ?? 'Engine re-validation failed', variant: 'destructive' });
      }
      refetch();
      queryClient.invalidateQueries({ queryKey: ['conflicts'] });
      queryClient.invalidateQueries({ queryKey: ['overview'] });
      queryClient.invalidateQueries({ queryKey: ['audit'] });
      queryClient.invalidateQueries({ queryKey: ['activities'] });
      onChanged();
    } catch (e) {
      toast({ title: 'Decision failed', description: e instanceof Error ? e.message : 'error', variant: 'destructive' });
    }
  };

  if (isLoading) {
    return <div className="space-y-3"><Loader2 className="w-6 h-6 animate-spin text-orange-600" /><div className="text-sm text-muted-foreground">Loading conflict analysis…</div></div>;
  }

  if (conflict.id.startsWith('live-')) {
    return (
      <div className="space-y-4">
        <BackButton onBack={onBack} />
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <TypeBadge type={conflict.conflictType} /> <SeverityBadge severity={conflict.severity} /> <StatusBadge status={conflict.status} />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>{conflict.rootCause}</div>
            <div className="text-muted-foreground">{conflict.directImpact}</div>
            <div className="text-xs text-muted-foreground">This conflict was detected live but is not yet persisted — re-run conflict detection to register it.</div>
            {canAnalyze && (
              <Button variant="outline" onClick={async () => {
                const { runDetection } = await import('@/lib/client-api');
                await runDetection();
                queryClient.invalidateQueries({ queryKey: ['conflicts'] });
              }}>Register via engine re-scan</Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const d: CD | undefined = data;
  if (!d) return <EmptyState icon={AlertTriangle} title="Conflict not found" description="It may have been resolved and removed by a re-scan." />;

  const latestRequest = d.resolutionRequests[0];
  const hasAwaiting = latestRequest?.status === 'AWAITING_APPROVAL';
  const r = conflict.affectedResources;

  return (
    <div className="space-y-4">
      <BackButton onBack={onBack} />

      {/* ===== header ===== */}
      <Card className="border-l-4" style={{ borderLeftColor: conflict.severity === 'CRITICAL' ? '#ef4444' : conflict.severity === 'HIGH' ? '#f97316' : '#f59e0b' }}>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">{d.conflict.code}</span>
            <TypeBadge type={d.conflict.conflictType} />
            <TypeBadge type={d.conflict.category} />
            <SeverityBadge severity={d.conflict.severity} />
            <StatusBadge status={d.conflict.status} />
          </div>
          <CardTitle className="text-base leading-snug mt-2">{d.conflict.rootCause}</CardTitle>
          <CardDescription>{d.conflict.directImpact}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* involved schedule records */}
          <div>
            <SectionLabel icon={FileSearch} label={`Involved schedule records (${d.activities.length})`} />
            <div className="space-y-1.5">
              {d.activities.map((a) => (
                <div key={a.id} className="glass-panel glass-hover rounded-lg border p-3 flex flex-wrap gap-x-4 gap-y-1 items-center text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">
                      {a.courseCode} {a.sectionCode} <span className="text-muted-foreground font-normal">· {a.courseName}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {a.day} {a.date} · {a.time} · {a.roomCode}{a.roomName ? ` (${a.roomName})` : ''} · {a.blockCode} · {a.facultyName} · {a.studentGroupCode}
                      {a.roomCapacity !== undefined && ` · ${a.capacityRequired}/${a.roomCapacity} seats`}
                    </div>
                    {a.notes && <div className="text-[11px] text-muted-foreground mt-0.5 italic">📝 {a.notes}</div>}
                  </div>
                  <div className="flex gap-1.5">
                    <TypeBadge type={a.activityType} />
                    <Badge variant="outline" className="font-mono text-[10px]">{a.activityCode}</Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs"
                      onClick={() => navigate('schedules', { activityId: a.id })}
                    >
                      View in schedule
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* affected resources */}
          <div>
            <SectionLabel icon={AlertTriangle} label="Affected resources" />
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
              <ResBox label="Rooms" items={r.rooms} />
              <ResBox label="Faculty" items={r.faculty} />
              <ResBox label="Student groups" items={r.studentGroups} />
              <ResBox label="Courses" items={r.courses} />
              <ResBox label="Academic blocks" items={r.blocks} />
              <ResBox label="Dates" items={d.conflict.affectedResources.dates ?? []} />
            </div>
          </div>

          {/* cascade chain */}
          <div>
            <SectionLabel icon={GitBranch} label="Cascading impact analysis (engine)" />
            <div className="glass-panel rounded-xl border p-3 space-y-2">
              {d.conflict.cascadingImpact.length === 0 ? (
                <div className="text-xs text-muted-foreground">No cascading effects recorded.</div>
              ) : (
                d.conflict.cascadingImpact.map((n, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <Badge variant="outline" className={cn('text-[10px] shrink-0 mt-0.5 font-mono', n.level === 1 ? 'border-red-300 bg-red-50 text-red-700 dark:bg-red-950/40' : 'border-slate-300 bg-slate-50 dark:bg-slate-800')}>L{n.level}</Badge>
                    <div className="text-xs min-w-0">
                      <span className="font-semibold">{n.resource}</span> — <span className="text-muted-foreground">{n.description}</span>
                      {n.conflictType && <Badge variant="outline" className="ml-1.5 text-[9px]">{n.conflictType}</Badge>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ===== agentic AI resolution workflow ===== */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Bot className="w-5 h-5 text-orange-600" /> Agentic AI Resolution Workflow
              </CardTitle>
              <CardDescription>
                10-stage pipeline: engine facts → AI reasoning → deterministic validation → ranking → human approval
              </CardDescription>
            </div>
            {canAnalyze && (
              <Button
                onClick={() => agent.mutate()}
                disabled={agent.isPending || hasAwaiting}
                className="bg-orange-600 hover:bg-orange-700"
              >
                {agent.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                {agent.isPending ? 'Running agentic analysis…' : hasAwaiting ? 'Awaiting approval below' : d.resolutionRequests.length > 0 ? 'Re-run AI analysis' : 'Run AI analysis'}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {d.resolutionRequests.length === 0 && !agent.isPending && (
            <EmptyState
              icon={Bot}
              title="No AI analysis yet"
              description={canAnalyze ? 'Run the agentic workflow: the engine re-verifies the conflict, the AI plans and narrates resolutions, candidates are validated against the complete schedule, ranked, and sent for your approval.' : 'An authorized scheduler or administrator must run the AI analysis.'}
            />
          )}

          {agent.isPending && <PipelineSkeleton />}

          {latestRequest && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              {/* stages */}
              <StagePipeline stages={latestRequest.stages} />

              {/* narrative */}
              {latestRequest.narrative && (
                <div className="glass-ai rounded-xl border border-orange-200 bg-orange-50/60 dark:bg-orange-950/30 dark:border-orange-900 p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-orange-800 dark:text-orange-300 mb-2">
                    <BrainCircuit className="w-4 h-4" /> AI root-cause narrative
                    <Badge variant="outline" className="text-[10px] font-normal">{latestRequest.narrative ? 'engine facts + LLM' : ''}</Badge>
                  </div>
                  <div className="text-sm whitespace-pre-wrap leading-relaxed">{latestRequest.narrative}</div>
                </div>
              )}

              {/* candidates */}
              <div>
                <SectionLabel icon={ListChecks} label={`Candidate solutions (${latestRequest.candidates.length}) — engine-validated & ranked`} />
                <div className="space-y-2">
                  {latestRequest.candidates.map((c) => (
                    <CandidateCard
                      key={c.id}
                      c={c}
                      isRecommended={c.status === 'SELECTED'}
                      canApprove={canApprove && hasAwaiting}
                      onApprove={() => decide('APPROVE', latestRequest.id, c.id)}
                    />
                  ))}
                </div>
              </div>

              {/* approval / rejection */}
              {hasAwaiting && (
                <div className="glass-panel rounded-xl border p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <UserCheck className="w-4 h-4 text-emerald-600" /> Human approval required
                  </div>
                  <div className="text-xs text-muted-foreground leading-relaxed">
                    The AI cannot modify the official LPU timetable. {canApprove ? 'As System Administrator you may approve the selected recommendation or reject it.' : 'Only a System Administrator can approve; you may reject or request re-analysis.'}
                  </div>
                  <Textarea placeholder="Decision note (recorded in the audit trail)" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
                  <div className="flex flex-wrap gap-2">
                    {canApprove && (
                      <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => decide('APPROVE', latestRequest.id)}>
                        <CheckCircle2 className="w-4 h-4 mr-1.5" /> Approve &amp; apply selected recommendation
                      </Button>
                    )}
                    <Button variant="outline" className="border-red-200 text-red-700 hover:bg-red-50" onClick={() => decide('REJECT', latestRequest.id)}>
                      <XCircle className="w-4 h-4 mr-1.5" /> Reject
                    </Button>
                  </div>
                </div>
              )}

              {/* decision outcome */}
              {latestRequest.status !== 'AWAITING_APPROVAL' && latestRequest.decidedBy && (
                <div className={cn('glass-tint rounded-xl border p-4 text-sm animate-in fade-in slide-in-from-bottom-2 duration-300', latestRequest.status === 'APPLIED' || latestRequest.status === 'APPROVED' ? 'border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/30 dark:border-emerald-900' : 'border-slate-200 bg-slate-50 dark:bg-slate-900')}>
                  <div className="font-semibold flex items-center gap-2">
                    {latestRequest.status === 'APPLIED' || latestRequest.status === 'APPROVED' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <XCircle className="w-4 h-4" />}
                    {latestRequest.status === 'APPLIED' ? 'Applied to official schedule' : latestRequest.status === 'REJECTED' ? 'Rejected' : latestRequest.status}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Decided by {latestRequest.decidedBy} · {latestRequest.decidedAt ? new Date(latestRequest.decidedAt).toLocaleString() : ''}
                    {latestRequest.decisionNote ? ` — "${latestRequest.decisionNote}"` : ''}
                  </div>
                  {d.conflict.resolutionNote && <div className="text-xs mt-2">{d.conflict.resolutionNote}</div>}
                </div>
              )}

              {/* history */}
              {d.resolutionRequests.length > 1 && (
                <Accordion type="single" collapsible>
                  <AccordionItem value="history">
                    <AccordionTrigger className="text-sm">
                      <span className="flex items-center gap-2"><History className="w-4 h-4" /> Previous analyses ({d.resolutionRequests.length - 1})</span>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-2">
                      {d.resolutionRequests.slice(1).map((req) => (
                        <div key={req.id} className="rounded border p-3 text-xs space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-muted-foreground">{req.code}</span>
                            <StatusBadge status={req.status} />
                            <span className="text-muted-foreground">{new Date(req.createdAt).toLocaleString()} · by {req.requestedByName}</span>
                          </div>
                          <div className="text-muted-foreground">{req.candidates.length} candidates · decision: {req.decidedBy ?? 'pending'}</div>
                        </div>
                      ))}
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="text-[11px] text-muted-foreground flex items-center gap-2">
        <Cog className="w-3.5 h-3.5" />
        Engine verification: {d.engineVerification.detectionPass} — {d.engineVerification.verifiedBy}
      </div>
    </div>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <Button variant="ghost" onClick={onBack} className="gap-1.5 -ml-2">
      <ArrowLeft className="w-4 h-4" /> Back to Conflict Center
    </Button>
  );
}

function SectionLabel({ icon: Icon, label }: { icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
      <Icon className="w-3.5 h-3.5" /> {label}
    </div>
  );
}

function ResBox({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="glass-panel rounded-lg border p-2.5">
      <div className="text-[10px] font-semibold text-muted-foreground uppercase">{label}</div>
      <div className="flex flex-wrap gap-1 mt-1">
        {items.length === 0 ? <span className="text-[10px] text-muted-foreground">—</span> : items.map((i) => (
          <Badge key={i} variant="secondary" className="text-[10px] font-mono">{i}</Badge>
        ))}
      </div>
    </div>
  );
}

function StagePipeline({ stages }: { stages: CD['resolutionRequests'][0]['stages'] }) {
  const [openStage, setOpenStage] = useState<number | null>(null);
  return (
    <div className="rounded-lg border divide-y">
      {stages.map((s) => {
        const Icon = STAGE_ICONS[s.key] ?? Cog;
        return (
          <div key={s.stage} className="glass-well rounded-lg border border-transparent p-3">
            <button className="w-full flex items-center gap-3 text-left rounded-lg px-1 -mx-1 py-1 transition-colors duration-150 hover:bg-muted/40 active:bg-muted/60" onClick={() => setOpenStage(openStage === s.stage ? null : s.stage)}>
              <div className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold',
                s.actor === 'ENGINE' ? 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200' :
                s.actor === 'AGENT' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/60 dark:text-orange-300' :
                'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300'
              )}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{s.stage}. {s.title}</span>
                  <ActorBadge actor={s.actor} />
                  {s.status === 'AWAITING' && <StatusBadge status="AWAITING_APPROVAL" />}
                </div>
                <div className="text-xs text-muted-foreground line-clamp-1">{s.summary}</div>
              </div>
              <div className="text-[10px] text-muted-foreground hidden sm:block tabular-nums">{new Date(s.at).toLocaleTimeString()}</div>
              <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform duration-200 shrink-0', openStage === s.stage && 'rotate-180')} />
            </button>
            {openStage === s.stage && s.detail && (
              <pre className="glass-well mt-2 text-[11px] whitespace-pre-wrap font-mono rounded-md p-2.5 max-h-64 overflow-y-auto overscroll-contain animate-in fade-in slide-in-from-top-1 duration-200">{s.detail}</pre>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CandidateCard({ c, isRecommended, canApprove, onApprove }: {
  c: CD['resolutionRequests'][0]['candidates'][0];
  isRecommended: boolean;
  canApprove: boolean;
  onApprove: () => void;
}) {
  const [showChecks, setShowChecks] = useState(false);
  return (
    <div className={cn(
      'rounded-xl border glass-panel p-3.5 space-y-2.5',
      isRecommended && 'glass-ai border-orange-300 bg-orange-50/50 dark:bg-orange-950/25 dark:border-orange-800 ring-1 ring-orange-200',
      !c.valid && 'opacity-75 border-red-200'
    )}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={cn('font-mono text-[10px]', c.rank === 1 ? 'bg-orange-100 border-orange-300' : '')}>#{c.rank}</Badge>
        <StatusBadge status={c.status} />
        <TypeBadge type={c.solutionType} />
        {c.valid ? (
          <Badge variant="outline" className="bg-emerald-50 border-emerald-300 text-emerald-700 text-[10px] gap-1">
            <ShieldCheck className="w-3 h-3" /> ENGINE-VALIDATED · score {c.score}/100
          </Badge>
        ) : (
          <Badge variant="outline" className="bg-red-50 border-red-300 text-red-700 text-[10px] gap-1">
            <XCircle className="w-3 h-3" /> REJECTED BY ENGINE
          </Badge>
        )}
        {isRecommended && <Badge className="bg-orange-600 text-[10px] gap-1"><Sparkles className="w-3 h-3" /> AI RECOMMENDATION</Badge>}
        {canApprove && isRecommended && (
          <Button size="sm" className="ml-auto h-7 bg-emerald-600 hover:bg-emerald-700 text-xs" onClick={onApprove}>
            <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Approve this
          </Button>
        )}
      </div>

      <div className="text-sm font-medium">{c.title}</div>

      {/* changes */}
      <div className="space-y-1">
        {c.changes.map((ch, i) => (
          <div key={i} className="text-xs flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="font-mono text-[10px]">{ch.activityCode}</Badge>
            <span className="text-muted-foreground">{ch.displayLabel}:</span>
            <span className="line-through text-red-500/80">{ch.displayFrom ?? String(ch.from)}</span>
            <span className="text-muted-foreground">→</span>
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">{ch.displayTo ?? String(ch.to)}</span>
          </div>
        ))}
      </div>

      {/* benefits / side effects */}
      <div className="grid sm:grid-cols-2 gap-2 text-xs">
        {c.expectedBenefits.length > 0 && (
          <div className="rounded border bg-emerald-50/50 dark:bg-emerald-950/25 p-2">
            <div className="font-semibold text-emerald-700 dark:text-emerald-400 text-[10px] uppercase mb-1">Expected benefits</div>
            <ul className="space-y-0.5">
              {c.expectedBenefits.map((b, i) => <li key={i} className="text-muted-foreground">✓ {b}</li>)}
            </ul>
          </div>
        )}
        {c.sideEffects.length > 0 && (
          <div className="rounded border bg-amber-50/50 dark:bg-amber-950/25 p-2">
            <div className="font-semibold text-amber-700 dark:text-amber-400 text-[10px] uppercase mb-1">Side effects</div>
            <ul className="space-y-0.5">
              {c.sideEffects.map((s, i) => <li key={i} className="text-muted-foreground">⚠ {s}</li>)}
            </ul>
          </div>
        )}
      </div>

      {/* AI reasoning */}
      {c.reasoning && (
        <div className="glass-well rounded-lg border border-transparent p-2.5">
          <div className="text-[10px] font-semibold uppercase text-muted-foreground mb-1 flex items-center gap-1">
            <Bot className="w-3 h-3 text-orange-600" /> AI explanation
          </div>
          <div className="text-xs whitespace-pre-wrap leading-relaxed">{c.reasoning}</div>
        </div>
      )}

      {/* validation report */}
      <button className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors duration-150 rounded-sm" onClick={() => setShowChecks(!showChecks)}>
        <ShieldCheck className="w-3.5 h-3.5" />
        Validation report ({c.validation.checks.filter((x) => x.passed).length}/{c.validation.checks.length} checks passed
        {c.validation.newHardConflicts.length > 0 ? `, ${c.validation.newHardConflicts.length} new hard conflict(s)` : ''}
        {c.validation.newSoftConflicts.length > 0 ? `, ${c.validation.newSoftConflicts.length} new soft` : ''})
        <ChevronDown className={cn('w-3 h-3 transition-transform duration-200', showChecks && 'rotate-180')} />
      </button>
      {showChecks && (
        <div className="glass-well rounded-lg border border-transparent p-2.5 space-y-1 animate-in fade-in slide-in-from-top-1 duration-200">
          {c.validation.checks.map((chk, i) => (
            <div key={i} className="flex items-start gap-1.5 text-xs">
              {chk.passed ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" /> : <XCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />}
              <div>
                <span className="font-medium">{chk.name}</span>
                <span className="text-muted-foreground"> — {chk.detail}</span>
              </div>
            </div>
          ))}
          {c.validation.newHardConflicts.map((h, i) => (
            <div key={`h${i}`} className="text-xs text-red-600 flex gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> New hard conflict: {h.description}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PipelineSkeleton() {
  return (
    <div className="rounded-lg border divide-y">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="p-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 bg-muted rounded animate-pulse w-48" />
            <div className="h-2.5 bg-muted rounded animate-pulse w-full max-w-md" />
          </div>
        </div>
      ))}
    </div>
  );
}
