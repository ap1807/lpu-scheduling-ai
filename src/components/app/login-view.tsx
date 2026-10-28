'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { AlertCircle, Building2, CalendarCog, Bot, GraduationCap, Loader2, Lock, LogIn, ShieldCheck } from 'lucide-react';

const DEMO_ACCOUNTS = [
  {
    email: 'admin@lpu.edu',
    password: 'Admin@123',
    role: 'System Administrator',
    name: 'Dr. Arvind Rana',
    icon: ShieldCheck,
    desc: 'Full visibility, approval authority, rules & users',
  },
  {
    email: 'scheduler@lpu.edu',
    password: 'Schedule@123',
    role: 'Academic Scheduler',
    name: 'Ms. Priya Sharma',
    icon: CalendarCog,
    desc: 'Manage schedules, investigate conflicts, run AI analysis',
  },
  {
    email: 'faculty@lpu.edu',
    password: 'Faculty@123',
    role: 'Faculty Member',
    name: 'Dr. Rajesh Kumar',
    icon: GraduationCap,
    desc: 'View own schedule, relevant conflicts & recommendations',
  },
  {
    email: 'student@lpu.edu',
    password: 'Student@123',
    role: 'Student',
    name: 'Ananya Verma',
    icon: Bot,
    desc: 'Read-only own timetable (CSE23-A) & schedule info',
  },
];

export function LoginView() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const doLogin = async (em: string, pw: string) => {
    setBusy(true);
    setError('');
    const res = await signIn('credentials', { email: em, password: pw, redirect: false });
    setBusy(false);
    if (res?.error) {
      setError('Invalid email or password. Use one of the demo accounts below.');
      return;
    }
    queryClient.clear();
    toast({ title: 'Signed in', description: 'Welcome to the LPU Scheduling Intelligence Platform' });
  };

  const quick = useMutation({
    mutationFn: (acc: { email: string; password: string }) => doLogin(acc.email, acc.password),
  });

  return (
    <div className="relative overflow-hidden min-h-screen flex flex-col bg-gradient-to-br from-background via-orange-50/40 to-background">
      {/* Ambient light (existing palette, restrained) */}
      <div aria-hidden className="pointer-events-none absolute -top-44 -left-40 w-[38rem] h-[38rem] rounded-full bg-orange-600/10 dark:bg-orange-600/15 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-56 -right-36 w-[36rem] h-[36rem] rounded-full bg-violet-500/10 dark:bg-violet-500/12 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute top-1/3 left-2/3 w-[26rem] h-[26rem] rounded-full bg-teal-500/10 dark:bg-teal-500/10 blur-3xl" />

      <header className="relative border-b bg-background/50 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-orange-600 flex items-center justify-center">
            <Building2 className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="font-bold text-lg leading-tight">Lovely Professional University</div>
            <div className="text-xs text-muted-foreground">Division of Academic Operations · Scheduling Intelligence</div>
          </div>
        </div>
      </header>

      <main className="relative flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-5xl grid lg:grid-cols-[400px_1fr] gap-8 animate-in fade-in slide-in-from-bottom-3 duration-500 ease-out">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LogIn className="w-5 h-5 text-orange-600" /> Sign in
              </CardTitle>
              <CardDescription>Authenticate with your LPU scheduling account</CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  doLogin(email, password);
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" placeholder="admin@lpu.edu" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
                </div>
                {error && (
                  <div className="text-sm text-red-600 flex items-start gap-2 bg-red-50 border border-red-200 rounded-md p-3">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
                <Button type="submit" className="w-full bg-gradient-to-b from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 shadow-lg shadow-orange-600/30 border border-orange-400/40" disabled={busy}>
                  {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Lock className="w-4 h-4 mr-2" />}
                  Sign in
                </Button>
              </form>
              <p className="text-xs text-muted-foreground mt-4 leading-relaxed">
                Access is enforced server-side on every API route (RBAC: Administrator / Scheduler / Faculty / Student).
                All sample identities are fictional.
              </p>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-bold">Agentic AI for LPU University Scheduling</h2>
              <h1 className="text-2xl font-bold text-orange-700">Conflict Detection &amp; Resolution Platform</h1>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                A deterministic scheduling engine finds every timetable conflict. An agentic AI layer explains root causes,
                generates candidate resolutions and ranks them — the engine independently validates every option, and a
                human administrator approves before anything touches the official timetable.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              {DEMO_ACCOUNTS.map((acc) => (
                <button
                  key={acc.email}
                  onClick={() => quick.mutate({ email: acc.email, password: acc.password })}
                  disabled={quick.isPending}
                  className="text-left rounded-xl border glass-panel glass-hover p-4 hover:border-orange-400 transition group active:scale-[0.99]"
                >
                  <div className="flex items-center gap-2">
                    <acc.icon className="w-4 h-4 text-orange-600" />
                    <span className="text-sm font-semibold">{acc.role}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">{acc.name}</div>
                  <div className="text-[11px] text-muted-foreground mt-1 leading-snug">{acc.desc}</div>
                  <div className="text-[11px] mt-2 font-mono text-orange-700 group-hover:underline">
                    {acc.email} · {acc.password}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </main>

      <footer className="relative border-t bg-background/55">
        <div className="max-w-6xl mx-auto px-4 py-4 text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 justify-between">
          <span>Demo build · Fictional sample data only</span>
          <span>Deterministic engine = source of truth · AI = reasoning layer · Human = approval authority</span>
        </div>
      </footer>
    </div>
  );
}
