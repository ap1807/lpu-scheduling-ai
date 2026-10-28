'use client';

import { useEffect, useRef, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useTheme } from 'next-themes';
import { useAppStore, VIEW_TITLES, type ViewKey } from '@/store/app-store';
import { useIsMobile } from '@/hooks/use-mobile';
import { bootstrap } from '@/lib/client-api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import {
  LayoutDashboard, CalendarDays, AlertTriangle, GitBranch, Bot, ScrollText, Settings,
  LogOut, Menu, Moon, Sun, Building2, ShieldCheck, RefreshCw,
} from 'lucide-react';

const NAV: Array<{ key: ViewKey; label: string; icon: React.ComponentType<{ className?: string }>; roles: string[] }> = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['ADMIN', 'SCHEDULER', 'FACULTY', 'STUDENT'] },
  { key: 'schedules', label: 'Schedules', icon: CalendarDays, roles: ['ADMIN', 'SCHEDULER', 'FACULTY', 'STUDENT'] },
  { key: 'conflicts', label: 'Conflict Center', icon: AlertTriangle, roles: ['ADMIN', 'SCHEDULER', 'FACULTY'] },
  { key: 'whatif', label: 'What-If Simulator', icon: GitBranch, roles: ['ADMIN', 'SCHEDULER'] },
  { key: 'assistant', label: 'AI Assistant', icon: Bot, roles: ['ADMIN', 'SCHEDULER', 'FACULTY', 'STUDENT'] },
  { key: 'audit', label: 'Audit Trail', icon: ScrollText, roles: ['ADMIN', 'SCHEDULER'] },
  { key: 'settings', label: 'Settings', icon: Settings, roles: ['ADMIN'] },
];

const ROLE_COLORS: Record<string, string> = {
  ADMIN: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  SCHEDULER: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  FACULTY: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  STUDENT: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const { view, navigate } = useAppStore();
  const { data: session } = useSession();
  const { theme, setTheme } = useTheme();
  const isMobile = useIsMobile();

  const role = (session?.user as { role?: string })?.role ?? 'STUDENT';
  const nav = NAV.filter((n) => n.roles.includes(role));
  const title = VIEW_TITLES[view];
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    // ensure the demo dataset exists on first load
    bootstrap().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!nav.some((n) => n.key === view)) navigate('dashboard');
  }, [role]);

  // Smooth navigation feedback: entering a view always starts from its top —
  // no stale mid-page scroll position carried across views. Instant (not
  // smooth) per accessibility guidance for large programmatic jumps.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [view]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top bar — floating Liquid Glass surface */}
      <header className="sticky top-0 z-40 px-3 pt-3">
        <div className="glass-float relative flex h-14 items-center gap-3 rounded-2xl border px-4">
          {isMobile && (
            <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Open navigation">
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-4 overflow-y-auto overscroll-contain">
                <div className="mb-4">
                  <Logo />
                </div>
                <SheetTitle className="sr-only">Main navigation</SheetTitle>
                <SheetDescription className="sr-only">Navigate between dashboard, schedules, conflict center and tools.</SheetDescription>
                <NavList view={view} navigate={navigate} nav={nav} onNavigate={() => setDrawerOpen(false)} />
              </SheetContent>
            </Sheet>
          )}
          {!isMobile && <Logo />}

          <div className="hidden md:block flex-1 min-w-0">
            <div className="font-semibold text-sm truncate">{title.title}</div>
            <div className="text-[11px] text-muted-foreground truncate">{title.subtitle}</div>
          </div>
          <div className="md:hidden flex-1 text-sm font-semibold truncate">{title.title}</div>

          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
            <div className="flex items-center gap-2">
              <Avatar className="w-8 h-8">
                <AvatarFallback className="bg-orange-600 text-white text-xs">
                  {(session?.user?.name ?? 'U').split(' ').map((p) => p[0]).slice(0, 2).join('')}
                </AvatarFallback>
              </Avatar>
              <div className="hidden sm:block text-right leading-tight">
                <div className="text-xs font-semibold">{session?.user?.name}</div>
                <div className="text-[10px] text-muted-foreground">{role}</div>
              </div>
              <Badge variant="secondary" className={cn('hidden lg:inline-flex text-[10px]', ROLE_COLORS[role])}>
                {role === 'ADMIN' && <ShieldCheck className="w-3 h-3 mr-1" />}
                {role}
              </Badge>
            </div>
            <Button variant="ghost" size="icon" onClick={() => signOut({ callbackUrl: '/' })} aria-label="Sign out">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex">
        {/* Desktop sidebar — floating glass rail */}
        {!isMobile && (
          <aside className="w-56 shrink-0 hidden lg:block pl-3 py-3">
            <div className="glass-float relative sticky top-[80px] flex h-[calc(100vh-104px)] flex-col rounded-2xl border p-3 overflow-y-auto overscroll-contain">
              <NavList view={view} navigate={navigate} nav={nav} onNavigate={undefined} />
              <div className="mt-6 mx-1 p-3 rounded-xl glass-tint border border-orange-100 bg-orange-50 dark:bg-orange-950/40 dark:border-orange-900">
                <div className="text-[11px] font-semibold text-orange-800 dark:text-orange-300 flex items-center gap-1">
                  <RefreshCw className="w-3 h-3" /> System status
                </div>
                <div className="text-[10px] text-muted-foreground mt-1 leading-snug">
                  Engine online · AI layer active · Human approval enforced
                </div>
              </div>
            </div>
          </aside>
        )}

        <main className="flex-1 min-w-0 p-4 md:p-6 pb-16">
          {/* Entrance transition on view change (fade + gentle rise, reduced-motion safe) */}
          <div key={view} className="animate-in fade-in slide-in-from-bottom-2 duration-300 ease-out">
            {children}
          </div>
        </main>
      </div>

      <footer className="border-t mt-auto bg-background/55">
        <div className="max-w-7xl mx-auto px-4 py-3 text-[11px] text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 justify-between">
          <span>Agentic AI for LPU University Scheduling Conflict Detection &amp; Resolution</span>
          <span className="hidden sm:inline">Deterministic engine = source of truth · AI = reasoning &amp; explanation · Administrator = approval authority</span>
        </div>
      </footer>
    </div>
  );
}

function NavList({ view, navigate, nav, onNavigate }: { view: ViewKey; navigate: (v: ViewKey) => void; nav: typeof NAV; onNavigate?: () => void }) {
  return (
    <nav className="space-y-1" aria-label="Main navigation">
      {nav.map((item) => (
        <button
          key={item.key}
          onClick={() => {
            navigate(item.key);
            onNavigate?.();
          }}
          className={cn(
            'w-full flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-[background-color,color,box-shadow] duration-150 ease-out',
            view === item.key
              ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200 shadow-[inset_0_1px_0_rgb(255_255_255/0.45)] dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.06)]'
              : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground active:bg-muted/80 hover:shadow-sm'
          )}
          aria-current={view === item.key ? 'page' : undefined}
        >
          <item.icon className="w-4 h-4 shrink-0" />
          <span>{item.label}</span>
          {item.key === 'conflicts' && view !== 'conflicts' && <span className="ml-auto w-2 h-2 rounded-full bg-red-500 animate-pulse" aria-hidden />}
        </button>
      ))}
    </nav>
  );
}

function Logo() {
  return (
    <button onClick={() => useAppStore.getState().navigate('dashboard')} className="flex items-center gap-2 shrink-0" aria-label="Go to dashboard">
      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-orange-700 shadow-md shadow-orange-600/25 flex items-center justify-center ring-1 ring-white/20">
        <Building2 className="w-5 h-5 text-white" />
      </div>
      <div className="hidden sm:block text-left leading-tight">
        <div className="font-bold text-sm">LPU Scheduling AI</div>
        <div className="text-[10px] text-muted-foreground">Conflict Detection &amp; Resolution</div>
      </div>
    </button>
  );
}
