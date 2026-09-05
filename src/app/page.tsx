'use client';

import { useQuery } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { AppShell } from '@/components/app/app-shell';
import { LoginView } from '@/components/app/login-view';
import { DashboardView } from '@/components/dashboard/dashboard-view';
import { ScheduleView } from '@/components/schedule/schedule-view';
import { ConflictCenterView } from '@/components/conflicts/conflict-center';
import { WhatIfView } from '@/components/whatif/whatif-view';
import { AssistantView } from '@/components/assistant/assistant-view';
import { AuditView } from '@/components/audit/audit-view';
import { SettingsView } from '@/components/settings/settings-view';
import { bootstrap } from '@/lib/client-api';
import { Loader2 } from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import { useEffect } from 'react';

export default function Home() {
  const { data: session, status } = useSession();
  const view = useAppStore((s) => s.view);

  useEffect(() => {
    if (status === 'unauthenticated') {
      bootstrap().catch(() => undefined);
    }
  }, [status]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-orange-600" />
      </div>
    );
  }

  if (!session) return <LoginView />;

  return (
    <AppShell>
      {view === 'dashboard' && <DashboardView />}
      {view === 'schedules' && <ScheduleView />}
      {view === 'conflicts' && <ConflictCenterView />}
      {view === 'whatif' && <WhatIfView />}
      {view === 'assistant' && <AssistantView />}
      {view === 'audit' && <AuditView />}
      {view === 'settings' && <SettingsView />}
    </AppShell>
  );
}

void useQuery;
