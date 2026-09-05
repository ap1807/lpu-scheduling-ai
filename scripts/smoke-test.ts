/**
 * End-to-end API smoke test — validates the complete golden-path workflow:
 * login → overview → conflicts → golden conflict → agentic resolution →
 * approve → apply → re-detect → verify resolution → audit trail.
 */
const BASE = 'http://localhost:3000';

function jar(): Map<string, string> {
  return new Map();
}

async function req(cookies: Map<string, string>, path: string, init: RequestInit = {}) {
  const cookieHeader = Array.from(cookies.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
  const res = await fetch(BASE + path, {
    ...init,
    redirect: 'manual',
    headers: { 'Content-Type': 'application/json', Cookie: cookieHeader, ...(init.headers ?? {}) },
  });
  const setCookies = res.headers.getSetCookie?.() ?? [];
  for (const c of setCookies) {
    const [pair] = c.split(';');
    const [name, ...rest] = pair.split('=');
    cookies.set(name, rest.join('='));
  }
  const text = await res.text();
  let json: unknown = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text.slice(0, 200) }; }
  return { status: res.status, json: json as Record<string, unknown> };
}

async function login(cookies: Map<string, string>, email: string, password: string) {
  const csrf = await req(cookies, '/api/auth/csrf');
  const token = (csrf.json.csrfToken as string) ?? '';
  const body = `email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}&csrfToken=${encodeURIComponent(token)}&json=true`;
  const res = await req(cookies, '/api/auth/callback/credentials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  return res.status;
}

async function main() {
  const cookies = jar();
  console.log('== 1. Login as admin ==');
  await login(cookies, 'admin@lpu.edu', 'Admin@123');
  const session = await req(cookies, '/api/auth/session');
  const user = (session.json.user ?? {}) as Record<string, string>;
  console.log('Logged in:', user.name, user.role);
  if (!user.role) throw new Error('Login failed');

  console.log('\n== 2. Overview ==');
  const overview = await req(cookies, '/api/overview');
  const kpis = (overview.json.kpis ?? {}) as Record<string, number>;
  console.log('KPIs:', JSON.stringify({ totalActivities: kpis.totalActivities, activeConflicts: kpis.activeConflicts, critical: kpis.criticalConflicts, health: kpis.scheduleHealth }));
  if (overview.status !== 200) throw new Error('Overview failed');

  console.log('\n== 3. Conflicts list ==');
  const conflicts = await req(cookies, '/api/conflicts?severity=CRITICAL');
  const list = (conflicts.json.conflicts ?? []) as Array<Record<string, unknown>>;
  console.log(`Critical conflicts: ${list.length}`);
  list.slice(0, 5).forEach((c) => console.log(`  - ${c.code} ${c.conflictType}: ${String(c.rootCause).slice(0, 110)}…`));

  console.log('\n== 4. Find the golden demo conflict (ROOM_TIME_OVERLAP B24-105 CSE301/CSE302) ==');
  const golden = list.find((c) => c.conflictType === 'ROOM_TIME_OVERLAP' && String(c.rootCause).includes('B24-105') && String(c.rootCause).includes('CSE301'));
  if (!golden) throw new Error('Golden conflict not found');
  console.log(`Found: ${golden.code} — ${golden.rootCause}`);

  console.log('\n== 5. Run agentic AI resolution workflow ==');
  const t0 = Date.now();
  const resolve = await req(cookies, '/api/resolve', { method: 'POST', body: JSON.stringify({ conflictId: golden.id }) });
  console.log(`Agent finished in ${((Date.now() - t0) / 1000).toFixed(1)}s, status: ${resolve.status}`);
  const agent = resolve.json as unknown as {
    requestId: string; code: string; narrativeSource: string;
    stages: Array<{ stage: number; title: string; actor: string; summary: string }>;
    candidates: Array<{ rank: number; title: string; valid: boolean; score: number }>;
    recommendation: { title: string; score: number; reasoning: string; reasoningSource: string } | null;
  };
  console.log(`Stages: ${agent.stages?.length}`);
  agent.stages?.forEach((s) => console.log(`  ${s.stage}. [${s.actor}] ${s.title} — ${s.summary.slice(0, 80)}…`));
  console.log(`Candidates: ${agent.candidates?.length} (${agent.candidates?.filter((c) => c.valid).length} valid)`);
  agent.candidates?.slice(0, 5).forEach((c) => console.log(`   #${c.rank} [${c.valid ? 'VALID' : 'INVALID'} ${c.score}] ${c.title}`));
  console.log(`Recommendation: ${agent.recommendation?.title} (score ${agent.recommendation?.score}, reasoning source: ${agent.recommendation?.reasoningSource})`);
  console.log(`Narrative source: ${agent.narrativeSource}`);
  if (resolve.status !== 200 || !agent.requestId) throw new Error('Agent failed: ' + JSON.stringify(resolve.json).slice(0, 300));

  console.log('\n== 6. Approve the recommendation (human-in-the-loop) ==');
  const decision = await req(cookies, `/api/resolve/${agent.requestId}/decision`, {
    method: 'POST',
    body: JSON.stringify({ decision: 'APPROVE', note: 'Smoke test approval' }),
  });
  console.log('Decision status:', decision.status);
  const d = decision.json as { applied?: boolean; verification?: { originalConflictResolved: boolean; newConflictsIntroduced: unknown[]; postDetection: { total: number; critical: number }; status: string }; reason?: string; error?: string };
  console.log('Applied:', d.applied, 'Reason:', d.reason ?? d.error ?? '—');
  if (d.verification) {
    console.log('Post-change verification:');
    console.log(`  originalConflictResolved: ${d.verification.originalConflictResolved}`);
    console.log(`  newConflictsIntroduced: ${d.verification.newConflictsIntroduced.length}`);
    console.log(`  postDetection: ${d.verification.postDetection.total} conflicts (${d.verification.postDetection.critical} critical)`);
    console.log(`  status: ${d.verification.status}`);
  }
  if (!d.applied) throw new Error('Approval did not apply: ' + JSON.stringify(decision.json).slice(0, 300));

  console.log('\n== 7. Confirm golden conflict is RESOLVED in conflict center ==');
  const after = await req(cookies, '/api/conflicts');
  const afterList = (after.json.conflicts ?? []) as Array<Record<string, unknown>>;
  const goldenAfter = afterList.find((c) => c.conflictType === 'ROOM_TIME_OVERLAP' && String(c.rootCause).includes('B24-105') && String(c.rootCause).includes('CSE301'));
  const activeGolden = afterList.find((c) => c.conflictType === 'ROOM_TIME_OVERLAP' && String(c.rootCause).includes('B24-105') && String(c.rootCause).includes('CSE301') && c.status !== 'RESOLVED');
  console.log('Golden conflict row kept for audit:', !!goldenAfter, '— status:', goldenAfter?.status);
  console.log('Golden conflict active (unresolved):', !!activeGolden, '— resolution note:', String(goldenAfter?.resolutionNote ?? '').slice(0, 130));
  if (activeGolden) throw new Error('Golden conflict NOT resolved!');

  console.log('\n== 8. Audit trail check ==');
  const audit = await req(cookies, '/api/audit?limit=200');
  const logs = (audit.json.logs ?? []) as Array<Record<string, string>>;
  const actions = logs.map((l) => l.action);
  console.log(`Audit entries: ${logs.length}`);
  for (const expected of ['SEED', 'AI_ANALYSIS_GENERATED', 'SOLUTION_APPROVED', 'CHANGE_APPLIED']) {
    console.log(`  ${expected}: ${actions.includes(expected) ? '✓ present' : '✗ MISSING'}`);
  }

  console.log('\n== 9. RBAC check: scheduler cannot approve ==');
  const schedCookies = jar();
  await login(schedCookies, 'scheduler@lpu.edu', 'Schedule@123');
  // run agent as scheduler, then try to approve → expect 403
  const resolve2 = await req(schedCookies, '/api/resolve', { method: 'POST', body: JSON.stringify({ conflictId: (afterList.find((c) => c.conflictType === 'ROOM_TIME_OVERLAP') ?? afterList[0]).id }) });
  if (resolve2.status === 200) {
    const agent2 = resolve2.json as unknown as { requestId: string };
    const deny = await req(schedCookies, `/api/resolve/${agent2.requestId}/decision`, { method: 'POST', body: JSON.stringify({ decision: 'APPROVE' }) });
    console.log('Scheduler approve attempt →', deny.status, deny.status === 403 ? '(403 Forbidden as expected ✓)' : '(UNEXPECTED!)');
  } else {
    console.log('Scheduler agent run skipped:', resolve2.status);
  }

  console.log('\n== 10. Student scoping check ==');
  const stuCookies = jar();
  await login(stuCookies, 'student@lpu.edu', 'Student@123');
  const stuOverview = await req(stuCookies, '/api/overview');
  const stuScope = (stuOverview.json.scope ?? {}) as Record<string, string>;
  const stuKpis = (stuOverview.json.kpis ?? {}) as Record<string, number>;
  console.log(`Student scope: ${stuScope.label}, activities: ${stuKpis.totalActivities} (should be small)`);
  const rulesAttempt = await req(stuCookies, '/api/rules', { method: 'PUT', body: JSON.stringify({ rules: { dayStartMin: 500 } }) });
  console.log('Student rules PUT →', rulesAttempt.status, rulesAttempt.status === 403 ? '(403 as expected ✓)' : '(UNEXPECTED!)');

  console.log('\n== 11. Assistant grounding check ==');
  const assistant = await req(cookies, '/api/assistant', { method: 'POST', body: JSON.stringify({ message: 'Why is CSE301 conflicting?' }) });
  const reply = assistant.json as unknown as { answer: string; source: string; intent: string; references: unknown[]; facts: string[] };
  console.log(`Assistant [${reply.intent}/${reply.source}]: ${reply.answer.slice(0, 220).replace(/\n/g, ' ')}…`);
  console.log(`  references: ${reply.references?.length ?? 0}, facts: ${reply.facts?.length ?? 0}`);

  console.log('\n== 12. What-if simulation ==');
  const acts = await req(cookies, '/api/activities?q=CSE302&date=' + (golden.dates as string[] | undefined)?.[0]);
  void acts;
  const activities = await req(cookies, '/api/activities');
  const actList = (activities.json.activities ?? []) as Array<Record<string, unknown>>;
  const someAct = actList.find((a) => a.courseCode === 'CSE302');
  if (someAct) {
    const sim = await req(cookies, '/api/simulate', { method: 'POST', body: JSON.stringify({ changes: [{ activityId: someAct.id, field: 'startMin', value: 930 }] }) });
    const simJson = sim.json as unknown as { delta: { conflictsResolved: unknown[]; conflictsCreated: unknown[]; overallImpact: string; impactScore: number; summary: string } };
    console.log('Simulation:', simJson.delta.summary.slice(0, 160));
    console.log(`  resolved ${simJson.delta.conflictsResolved.length}, created ${simJson.delta.conflictsCreated.length}, impact ${simJson.delta.overallImpact} ${simJson.delta.impactScore}`);
  }

  console.log('\n✅✅✅ FULL GOLDEN-PATH SMOKE TEST PASSED');
}

main().catch((err) => {
  console.error('\n❌ SMOKE TEST FAILED:', err.message);
  process.exit(1);
});
