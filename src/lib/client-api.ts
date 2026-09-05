'use client';

/** Typed client for the LPU scheduling platform API. */

export interface ApiError {
  error: string;
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error((data as ApiError).error ?? `Request failed (${res.status})`);
  }
  return data as T;
}

// ---------------- Overview ----------------
export interface OverviewData {
  scope: { role: string; label: string; wide: boolean };
  kpis: Record<string, number>;
  analytics: {
    conflictsByType: Array<{ name: string; value: number }>;
    conflictsBySeverity: Array<{ name: string; value: number }>;
    conflictsBySchool: Array<{ name: string; value: number }>;
    conflictsByBlock: Array<{ name: string; value: number }>;
    conflictsByDate: Array<{ name: string; value: number }>;
    classroomUtilization: Array<{ code: string; block: string; capacity: number; pct: number; hours: number }>;
    labUtilization: Array<{ code: string; block: string; capacity: number; pct: number; hours: number }>;
    facultyWorkload: Array<{ name: string; school: string; hours: number; max: number; pct: number }>;
    capacityUtilization: { avgFill: number; overfull: number };
    timetableByDay: Array<{ name: string; classes: number }>;
    timetableByHour: Array<{ name: string; classes: number }>;
    exam: { totalExams: number; examConflicts: number; byType: string[]; dates: string[] };
    resolutionStats: { total: number; awaiting: number; approved: number; rejected: number };
  };
  window: { dates: string[]; start: string; end: string };
}

export const fetchOverview = () => jsonFetch<OverviewData>('/api/overview');

// ---------------- Resources ----------------
export interface ResourcesData {
  blocks: Array<{ id: string; code: string; name: string; campus: string }>;
  schools: Array<{ id: string; code: string; name: string; blockId: string | null }>;
  programs: Array<{ id: string; code: string; name: string; schoolId: string; degreeLevel: string }>;
  courses: Array<{ id: string; code: string; name: string; schoolId: string; credits: number; courseType: string; requiresLab: boolean; examDurationMin: number }>;
  faculty: Array<{ id: string; code: string; name: string; schoolId: string; designation: string; maxWeeklyHours: number; email: string }>;
  rooms: Array<{ id: string; code: string; roomNo: string; name: string; blockId: string; roomType: string; capacity: number; isExamVenue: boolean }>;
  studentGroups: Array<{ id: string; code: string; name: string; programId: string; semester: number; section: string; size: number }>;
}

export const fetchResources = () => jsonFetch<ResourcesData>('/api/resources');

// ---------------- Activities ----------------
export interface ActivityRow {
  id: string;
  activityCode: string;
  courseCode: string;
  courseName: string;
  sectionCode: string;
  programCode: string;
  schoolCode: string;
  facultyId: string;
  facultyName: string;
  studentGroupId: string;
  studentGroupCode: string;
  roomId: string;
  roomCode: string;
  blockCode: string;
  activityType: string;
  date: string;
  dayOfWeek: number;
  startMin: number;
  endMin: number;
  capacityRequired: number;
  notes: string | null;
  status: string;
  isDemoConflict: boolean;
  createdAt: string;
  updatedAt: string;
}

export const fetchActivities = (params: Record<string, string | undefined>) => {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v) sp.set(k, v);
  });
  return jsonFetch<{ activities: ActivityRow[]; total: number }>(`/api/activities?${sp.toString()}`);
};

export const createActivity = (data: Record<string, unknown>) =>
  jsonFetch<{ activity: ActivityRow; conflictsAfter: number }>('/api/activities', { method: 'POST', body: JSON.stringify(data) });

export const updateActivity = (id: string, data: Record<string, unknown>) =>
  jsonFetch<{ activity: ActivityRow; conflictsAfter: number; conflictsInvolvingThis: number }>(`/api/activities/${id}`, { method: 'PUT', body: JSON.stringify(data) });

export const deleteActivity = (id: string) =>
  jsonFetch<{ deleted: boolean; conflictsAfter: number }>(`/api/activities/${id}`, { method: 'DELETE' });

export const duplicateActivity = (id: string) =>
  jsonFetch<{ activity: ActivityRow; conflictsAfter: number }>(`/api/activities/${id}/duplicate`, { method: 'POST' });

// ---------------- Conflicts ----------------
export interface ConflictListRow {
  id: string;
  code: string;
  conflictType: string;
  category: string;
  severity: string;
  status: string;
  rootCause: string;
  directImpact: string;
  affectedResources: Record<string, string[]>;
  cascadingImpact: Array<{ level: number; description: string; resource: string; conflictType?: string; severity?: string }>;
  detectedAt: string;
  resolvedAt: string | null;
  resolutionNote: string | null;
  activityCount: number;
  preview: string;
  dates: string[];
}

export const fetchConflicts = (params: Record<string, string | undefined>) => {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v) sp.set(k, v);
  });
  return jsonFetch<{ conflicts: ConflictListRow[]; total: number }>(`/api/conflicts?${sp.toString()}`);
};

export const runDetection = () => jsonFetch<{ total: number; critical: number; high: number; medium: number; low: number }>('/api/conflicts/detect', { method: 'POST' });

export interface ConflictDetail {
  conflict: {
    id: string;
    code: string;
    conflictType: string;
    category: string;
    severity: string;
    status: string;
    rootCause: string;
    directImpact: string;
    cascadingImpact: Array<{ level: number; description: string; resource: string; conflictType?: string; severity?: string }>;
    affectedResources: Record<string, string[]>;
    detectedAt: string;
    lastAnalyzedAt: string | null;
    resolvedAt: string | null;
    resolutionNote: string | null;
  };
  activities: Array<{
    id: string;
    activityCode: string;
    courseCode: string;
    courseName: string;
    sectionCode: string;
    activityType: string;
    date: string;
    day: string;
    time: string;
    startMin: number;
    endMin: number;
    roomCode: string;
    roomName?: string;
    roomCapacity?: number;
    facultyName: string;
    studentGroupCode: string;
    capacityRequired: number;
    blockCode: string;
    notes?: string;
    schoolCode: string;
  }>;
  snapshot: Array<Record<string, string | number>>;
  resolutionRequests: Array<{
    id: string;
    code: string;
    status: string;
    createdAt: string;
    requestedByName: string;
    decidedBy: string | null;
    decidedAt: string | null;
    decisionNote: string | null;
    stages: Array<{ stage: number; key: string; title: string; actor: string; status: string; summary: string; detail: string; at: string }>;
    narrative: string | null;
    recommendation: {
      candidateId: string;
      title: string;
      solutionType: string;
      score: number;
      reasoning: string;
      reasoningSource: string;
      changes: Array<{ field: string; from: string; to: string; activityCode: string }>;
      validation: { valid: boolean; checks: Array<{ name: string; passed: boolean; detail: string }> };
      expectedBenefits: string[];
      sideEffects: string[];
    } | null;
    candidates: Array<{
      id: string;
      rank: number;
      title: string;
      solutionType: string;
      valid: boolean;
      score: number;
      status: string;
      changes: Array<{ activityId: string; activityCode: string; field: string; from: string | number; to: string | number; displayLabel: string; displayFrom?: string; displayTo?: string }>;
      validation: {
        engineVerified: boolean;
        targetConflictResolved: boolean;
        newHardConflicts: Array<{ type: string; description: string; signature: string }>;
        newSoftConflicts: Array<{ type: string; description: string; signature: string }>;
        checks: Array<{ name: string; passed: boolean; detail: string }>;
        failed: boolean;
      };
      expectedBenefits: string[];
      sideEffects: string[];
      reasoning: string;
    }>;
  }>;
  engineVerification: { verifiedBy: string; detectionPass: string };
}

export const fetchConflictDetail = (id: string) => jsonFetch<ConflictDetail>(`/api/conflicts/${id}`);

// ---------------- Resolution agent ----------------
export interface AgentReply {
  requestId: string;
  code: string;
  conflictCode: string;
  status: string;
  stages: Array<{ stage: number; key: string; title: string; actor: string; status: string; summary: string; detail: string; at: string }>;
  narrative: string;
  narrativeSource: string;
  recommendation: {
    candidateId: string;
    title: string;
    solutionType: string;
    score: number;
    reasoning: string;
    reasoningSource: string;
    changes: Array<{ field: string; from: string; to: string; activityCode: string }>;
    validation: { valid: boolean; checks: Array<{ name: string; passed: boolean; detail: string }> };
    expectedBenefits: string[];
    sideEffects: string[];
  } | null;
  candidates: Array<{
    id: string;
    rank: number;
    title: string;
    solutionType: string;
    valid: boolean;
    score: number;
    changes: Array<{ field: string; from: string; to: string; activityCode: string }>;
    validation: { valid: boolean; newHardConflicts: number; newSoftConflicts: number; checks: Array<{ name: string; passed: boolean; detail: string }> };
    expectedBenefits: string[];
    sideEffects: string[];
    reasoning: string;
  }>;
}

export const runResolutionAgent = (conflictId: string) =>
  jsonFetch<AgentReply>('/api/resolve', { method: 'POST', body: JSON.stringify({ conflictId }) });

export const decideResolution = (requestId: string, decision: 'APPROVE' | 'REJECT', candidateId?: string, note?: string) =>
  jsonFetch<{
    decision: string;
    applied: boolean;
    reason?: string;
    verification?: {
      originalConflictResolved: boolean;
      newConflictsIntroduced: Array<{ type: string; description: string }>;
      postDetection: { total: number; critical: number; high: number; medium: number; low: number };
      status: string;
    };
  }>(`/api/resolve/${requestId}/decision`, { method: 'POST', body: JSON.stringify({ decision, candidateId, note }) });

// ---------------- Simulation ----------------
export interface SimulationResult {
  scenarioId: string | null;
  delta: {
    conflictsResolved: Array<{ signature: string; type: string; description: string }>;
    conflictsCreated: Array<{ signature: string; type: string; description: string }>;
    affectedFaculty: string[];
    affectedStudentGroups: string[];
    affectedRooms: string[];
    capacityChanges: Array<{ roomCode: string; before: number; after: number; note: string }>;
    workloadChanges: Array<{ facultyName: string; before: number; after: number }>;
    timetableChanges: Array<{ activityCode: string; description: string }>;
    overallImpact: string;
    impactScore: number;
    summary: string;
  };
  cascade: {
    chain: Array<{ level: number; description: string; resource: string; conflictType?: string; severity?: string; activityCode?: string }>;
    newConflicts: Array<{ conflictType: string; severity: string; rootCause: string; signature: string }>;
    hasCascadingRisk: boolean;
  };
}

export const runSimulation = (changes: Array<{ activityId: string; field: string; value: string | number }>, save?: { name: string; description?: string }) =>
  jsonFetch<SimulationResult>('/api/simulate', { method: 'POST', body: JSON.stringify({ changes, save: !!save, name: save?.name, description: save?.description }) });

export interface ScenarioRow {
  id: string;
  name: string;
  description: string | null;
  status: string;
  createdAt: string;
  changes: Array<{ activityId: string; field: string; value: string | number }>;
  result: { delta?: SimulationResult['delta']; cascade?: { chain: SimulationResult['cascade']['chain']; hasCascadingRisk: boolean } };
  createdBy: string;
}

export const fetchScenarios = () => jsonFetch<{ scenarios: ScenarioRow[] }>('/api/simulate');
export const applyScenario = (id: string) => jsonFetch<{ applied: boolean; result: unknown }>(`/api/simulate/${id}/apply`, { method: 'POST' });
export const discardScenario = (id: string) => jsonFetch<{ discarded: boolean }>(`/api/simulate/${id}/apply`, { method: 'DELETE' });

// ---------------- Assistant ----------------
export interface AssistantReply2 {
  answer: string;
  source: string;
  intent: string;
  references: Array<{ kind: string; code: string; label: string }>;
  facts: string[];
  suggestions: string[];
  followUpActions: Array<{ label: string; view: string; params?: Record<string, string> }>;
}

export const askAssistant = (message: string, history: Array<{ role: string; content: string }>) =>
  jsonFetch<AssistantReply2>('/api/assistant', { method: 'POST', body: JSON.stringify({ message, history }) });

// ---------------- Audit ----------------
export interface AuditRow {
  id: string;
  code: string;
  action: string;
  actorName: string;
  actorRole: string;
  conflictCode: string | null;
  targetType: string;
  targetId: string | null;
  summary: string;
  createdAt: string;
  details: string;
}

export const fetchAudit = (params: Record<string, string | undefined>) => {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v) sp.set(k, v);
  });
  return jsonFetch<{ logs: AuditRow[]; total: number }>(`/api/audit?${sp.toString()}`);
};

// ---------------- Rules ----------------
export interface RulesData {
  rules: Record<string, number | boolean | number[]>;
  defaults: Record<string, number | boolean | number[]>;
}

export const fetchRules = () => jsonFetch<RulesData>('/api/rules');
export const updateRules = (rules: Record<string, unknown>) =>
  jsonFetch<{ rules: Record<string, unknown> }>('/api/rules', { method: 'PUT', body: JSON.stringify({ rules }) });

// ---------------- Users ----------------
export const fetchUsers = () =>
  jsonFetch<{ users: Array<{ id: string; email: string; name: string; role: string; title: string | null; isActive: boolean; createdAt: string }> }>('/api/users');

export const resetDemoData = () =>
  jsonFetch<{ reseeded: boolean; summary: { activities: number; conflicts: number } }>('/api/reset', { method: 'POST' });

export const bootstrap = () => jsonFetch<{ seeded: boolean }>('/api/bootstrap', { method: 'POST' });
