'use client';

import { create } from 'zustand';

export type ViewKey =
  | 'dashboard'
  | 'schedules'
  | 'conflicts'
  | 'whatif'
  | 'assistant'
  | 'audit'
  | 'settings';

interface NavigationParams {
  conflictId?: string;
  conflictSignature?: string;
  activityId?: string;
  roomId?: string;
  scenarioId?: string;
  [key: string]: string | undefined;
}

interface AppState {
  view: ViewKey;
  params: NavigationParams;
  navigate: (view: ViewKey, params?: NavigationParams) => void;
  clearParams: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  view: 'dashboard',
  params: {},
  navigate: (view, params = {}) => set({ view, params }),
  clearParams: () => set({ params: {} }),
}));

export const VIEW_TITLES: Record<ViewKey, { title: string; subtitle: string }> = {
  dashboard: { title: 'Command Dashboard', subtitle: 'Real-time overview of LPU scheduling health' },
  schedules: { title: 'Schedule Management', subtitle: 'Calendar, timetable & table views of all academic activities' },
  conflicts: { title: 'LPU Conflict Center', subtitle: 'Detect, investigate and resolve scheduling conflicts' },
  whatif: { title: 'What-If Simulator', subtitle: 'Test schedule changes without touching the official timetable' },
  assistant: { title: 'LPU AI Scheduling Assistant', subtitle: 'Ask questions — answers grounded in real schedule data' },
  audit: { title: 'Audit Trail', subtitle: 'Complete history of scheduling operations & decisions' },
  settings: { title: 'Settings & Policy', subtitle: 'Scheduling rules, users & system configuration' },
};
