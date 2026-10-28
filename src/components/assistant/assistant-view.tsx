'use client';

import { useRef, useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAppStore } from '@/store/app-store';
import { askAssistant, type AssistantReply2 } from '@/lib/client-api';
import { cn } from '@/lib/utils';
import { Bot, Send, Loader2, User, ShieldCheck, Database, ArrowRight, Lightbulb, AlertTriangle } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  reply?: AssistantReply2;
}

const SUGGESTED = [
  'Find all room conflicts tomorrow',
  'Why is CSE301 conflicting?',
  'Find all conflicts for CSE students',
  'Give me the best solution for this conflict',
  'What happens if I move ACT-0042 to B24-201?',
  'Find all conflicts caused by the examination schedule',
  'Which rooms are underutilized today?',
  'Which faculty members have excessive workload?',
  'Show me all critical conflicts in block B24',
];

export function AssistantView() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const navigate = useAppStore((s) => s.navigate);
  const role = (useSession().data?.user as { role?: string })?.role ?? 'STUDENT';

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setInput('');
    const history = messages.slice(-6).map((m) => ({ role: m.role, content: m.content }));
    setMessages((m) => [...m, { role: 'user', content: q }]);
    setBusy(true);
    try {
      const reply = await askAssistant(q, history);
      setMessages((m) => [...m, { role: 'assistant', content: reply.answer, reply }]);
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', content: `⚠ The assistant could not process this request: ${e instanceof Error ? e.message : 'unknown error'}` }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid lg:grid-cols-[1fr_300px] gap-4">
      <Card className="flex flex-col h-[calc(100vh-190px)] min-h-[500px]">
        <CardHeader className="pb-3 border-b">
          <CardTitle className="text-sm flex items-center gap-2">
            <Bot className="w-5 h-5 text-orange-600" /> LPU AI Scheduling Assistant
          </CardTitle>
          <CardDescription className="text-xs">
            Answers are grounded in live database records — the assistant never fabricates courses, faculty, rooms or conflicts.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-8 space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center mx-auto">
                <Bot className="w-7 h-7 text-orange-600" />
              </div>
              <div>
                <div className="font-semibold">Ask anything about the LPU schedule</div>
                <div className="text-sm text-muted-foreground mt-1">
                  The deterministic engine retrieves the facts; the AI explains, reasons and recommends.
                </div>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTED.slice(0, 6).map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="text-xs rounded-full border glass-chip px-3 py-1.5 text-muted-foreground hover:text-foreground transition"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={cn('flex gap-2.5', m.role === 'user' && 'justify-end')}>
              {m.role === 'assistant' && (
                <div className="w-8 h-8 rounded-lg bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4 text-orange-600" />
                </div>
              )}
              <div className={cn(
                'max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed space-y-3',
                m.role === 'user' ? 'bg-orange-600 text-white' : 'border glass-panel'
              )}>
                <div className="whitespace-pre-wrap">{m.content}</div>

                {m.reply && <ReplyMeta reply={m.reply} onNavigate={(view, params) => navigate(view as never, params)} />}
              </div>
              {m.role === 'user' && (
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <User className="w-4 h-4 text-muted-foreground" />
                </div>
              )}
            </div>
          ))}

          {busy && (
            <div className="flex gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 text-orange-600" />
              </div>
              <div className="border glass-panel rounded-xl px-3.5 py-2.5 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin text-orange-600" />
                Retrieving schedule records and reasoning…
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </CardContent>

        <div className="p-3 border-t flex gap-2">
          <form
            className="flex-1 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <input
              className="flex-1 rounded-md border bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40"
              placeholder="e.g. Find all room conflicts tomorrow…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={600}
            />
            <Button type="submit" size="icon" className="bg-orange-600 hover:bg-orange-700" disabled={busy || !input.trim()} aria-label="Send">
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </div>
      </Card>

      {/* side panel */}
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold flex items-center gap-1.5"><Database className="w-3.5 h-3.5 text-orange-600" /> Grounding rules</CardTitle>
          </CardHeader>
          <CardContent className="text-[11px] text-muted-foreground space-y-2">
            <div className="flex gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" /> A deterministic intent router retrieves REAL records from the database first.</div>
            <div className="flex gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" /> The LLM composes the answer using ONLY retrieved facts — never invented data.</div>
            <div className="flex gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" /> Conflict facts &amp; validity always come from the engine, not the AI.</div>
            <div className="flex gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" /> If the language service is down, deterministic answers are returned instead.</div>
            <div className="pt-1 border-t text-[10px]">Your role: {role} — answers are scoped to your permissions.</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold flex items-center gap-1.5"><Lightbulb className="w-3.5 h-3.5 text-amber-500" /> Try asking</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {SUGGESTED.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="glass-ai w-full text-left text-[11px] rounded-lg border border-orange-200 bg-orange-50 dark:bg-orange-950/40 dark:border-orange-800 px-2.5 py-1.5 text-muted-foreground hover:text-foreground transition"
              >
                {s}
              </button>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ReplyMeta({ reply, onNavigate }: { reply: AssistantReply2; onNavigate: (view: string, params?: Record<string, string>) => void }) {
  if (reply.source === 'fallback') {
    return (
      <div className="text-[10px] text-muted-foreground flex items-center gap-1 border-t pt-2">
        <AlertTriangle className="w-3 h-3 text-amber-500" /> Deterministic engine answer (AI language service unavailable)
      </div>
    );
  }
  return (
    <div className="space-y-2 border-t pt-2">
      <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
        <Badge variant="outline" className="text-[9px] font-mono">intent: {reply.intent}</Badge>
        <Badge variant="outline" className="text-[9px] font-mono bg-emerald-50 text-emerald-700 border-emerald-300">grounded in {reply.facts.length} verified fact(s)</Badge>
      </div>
      {reply.references.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {reply.references.slice(0, 8).map((ref, i) => (
            <span key={i} className="text-[9px] font-mono rounded bg-muted px-1.5 py-0.5 text-muted-foreground" title={ref.label}>
              {ref.kind}:{ref.code}
            </span>
          ))}
        </div>
      )}
      {reply.suggestions.length > 0 && (
        <div className="text-[10px] text-muted-foreground">
          💡 {reply.suggestions.join(' · ')}
        </div>
      )}
      {reply.followUpActions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {reply.followUpActions.map((a, i) => (
            <button
              key={i}
              onClick={() => onNavigate(a.view, a.params)}
              className="glass-ai text-[10px] inline-flex items-center gap-1 rounded-md border border-orange-200 bg-orange-50 dark:bg-orange-950/40 dark:border-orange-800 px-2 py-1 text-orange-700 dark:text-orange-300 hover:bg-orange-100"
            >
              {a.label} <ArrowRight className="w-3 h-3" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
