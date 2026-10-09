import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import { db } from '@/db';
import { testCases, testRuns, runSteps, runArtifacts, recordingVersions } from '@/db/schema';
import { parseRecordingScript, ScriptError } from './recordingScript';
import type { TestCase, TestRun, ExecutionStep, RunArtifact } from './types';
const state = globalThis as typeof globalThis & { caseforgeWorkerId?: string };
export const owner = (state.caseforgeWorkerId ??= randomUUID());
export class WorkspaceError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
const optional = <T>(value: T | null) => value ?? undefined;
function runRecord(row: typeof testRuns.$inferSelect): TestRun {
  return {
    id: row.id,
    testId: optional(row.testId),
    sourceRunId: optional(row.sourceRunId),
    recordingVersionId: optional(row.recordingVersionId),
    recordingSteps: optional(row.recordingSteps),
    name: row.name,
    url: row.url,
    goal: row.goal,
    mode: row.mode,
    status: row.status,
    startedAt: row.startedAt,
    finishedAt: optional(row.finishedAt),
    durationMs: optional(row.durationMs),
    error: optional(row.error),
    plan: optional(row.plan),
    events: row.events,
    browserLogs: row.browserLogs,
    replayable: row.replayable,
    cancelRequested: row.cancelRequested,
    steps: [],
    artifacts: [],
  };
}
function stepRecord(row: typeof runSteps.$inferSelect): ExecutionStep {
  return {
    ...row,
    finishedAt: optional(row.finishedAt),
    durationMs: optional(row.durationMs),
    planNodeId: optional(row.planNodeId),
    action: optional(row.action),
    assertion: optional(row.assertion),
    playwrightAssertion: optional(row.playwrightAssertion),
    condition: optional(row.condition),
    decision: optional(row.decision),
    evidence: optional(row.evidence),
    error: optional(row.error),
  };
}
function artifactRecord(row: typeof runArtifacts.$inferSelect): RunArtifact {
  const { path: _path, ...artifact } = row;
  void _path;
  return { ...artifact, stepId: optional(row.stepId) };
}
export async function recoverExpiredRuns() {
  const finishedAt = new Date().toISOString();
  await db
    .update(testRuns)
    .set({
      status: 'failed',
      error: '执行服务连接中断，请重新运行。',
      finishedAt,
      durationMs: sql`greatest(0, round(extract(epoch from (${finishedAt}::timestamptz - ${testRuns.startedAt})) * 1000))::integer`,
      replayable: false,
    })
    .where(
      and(
        eq(testRuns.status, 'running'),
        lt(testRuns.heartbeatAt, new Date(Date.now() - 60000).toISOString()),
      ),
    );
  await db
    .update(runSteps)
    .set({
      status: 'failed',
      error: '执行服务连接中断',
      finishedAt,
      durationMs: sql`greatest(0, round(extract(epoch from (${finishedAt}::timestamptz - ${runSteps.startedAt})) * 1000))::integer`,
    })
    .where(
      and(
        eq(runSteps.status, 'running'),
        inArray(
          runSteps.runId,
          db.select({ id: testRuns.id }).from(testRuns).where(eq(testRuns.status, 'failed')),
        ),
      ),
    );
}
export const listTests = () => db.select().from(testCases).orderBy(desc(testCases.updatedAt));
export async function saveTest(
  input: Pick<TestCase, 'name' | 'url' | 'goal' | 'tags'>,
  id?: string,
) {
  const [test] = id
    ? await db
        .update(testCases)
        .set({ ...input, updatedAt: new Date().toISOString() })
        .where(eq(testCases.id, id))
        .returning()
    : await db.insert(testCases).values(input).returning();
  if (!test) throw new WorkspaceError('用例不存在。', 404);
  return test;
}
export async function deleteTest(id: string) {
  const rows = await db
    .delete(testCases)
    .where(eq(testCases.id, id))
    .returning({ id: testCases.id });
  if (!rows.length) throw new WorkspaceError('用例不存在。', 404);
}
export async function listRuns() {
  await recoverExpiredRuns();
  return (await db.select().from(testRuns).orderBy(desc(testRuns.startedAt))).map(runRecord);
}
export async function getRun(id: string): Promise<TestRun> {
  await recoverExpiredRuns();
  const [run] = await db.select().from(testRuns).where(eq(testRuns.id, id));
  if (!run) throw new WorkspaceError('执行记录不存在。', 404);
  const [steps, artifacts] = await Promise.all([
    db.select().from(runSteps).where(eq(runSteps.runId, id)).orderBy(asc(runSteps.sequence)),
    db
      .select()
      .from(runArtifacts)
      .where(eq(runArtifacts.runId, id))
      .orderBy(asc(runArtifacts.elapsedMs)),
  ]);
  return {
    ...runRecord(run),
    steps: steps.map(stepRecord),
    artifacts: artifacts.map(artifactRecord),
  };
}
export async function createRun(input: {
  testId?: string;
  case?: string;
  url?: string;
  sourceRunId?: string;
  recordingVersionId?: string;
  mode?: 'record' | 'replay';
}) {
  await recoverExpiredRuns();
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(481516234)`);
    const [active] = await tx
      .select({ id: testRuns.id })
      .from(testRuns)
      .where(eq(testRuns.status, 'running'))
      .limit(1);
    if (active) throw new WorkspaceError('已有测试正在执行，请等待完成或停止后再运行。', 409);
    let snapshot: {
      testId?: string;
      name: string;
      goal: string;
      url: string;
      sourceRunId?: string;
      recordingVersionId?: string;
      recordingSteps?: ExecutionStep[];
      mode: 'record' | 'replay';
    };
    if (input.mode === 'replay' && input.sourceRunId) {
      const [source] = await tx.select().from(testRuns).where(eq(testRuns.id, input.sourceRunId));
      if (!source) throw new WorkspaceError('原执行不存在。', 404);
      const [version] = input.recordingVersionId
        ? await tx
            .select()
            .from(recordingVersions)
            .where(
              and(
                eq(recordingVersions.id, input.recordingVersionId),
                eq(recordingVersions.runId, source.id),
              ),
            )
        : [];
      if (input.recordingVersionId && !version)
        throw new WorkspaceError('录制版本不存在或不属于此执行。', 404);
      if (source.status === 'running') throw new WorkspaceError('请等待录制结束后重放。', 409);
      if (!version && (source.status !== 'passed' || !source.replayable))
        throw new WorkspaceError('该记录包含失败或无法稳定定位的步骤，不能重放操作。');
      snapshot = {
        testId: optional(source.testId),
        name: source.name,
        url: source.url,
        goal: source.goal,
        mode: 'replay',
        sourceRunId: source.id,
        recordingVersionId: version?.id,
        recordingSteps: version?.steps,
      };
    } else if (input.testId) {
      const [test] = await tx.select().from(testCases).where(eq(testCases.id, input.testId));
      if (!test) throw new WorkspaceError('用例不存在。', 404);
      snapshot = {
        testId: test.id,
        name: test.name,
        url: test.url,
        goal: test.goal,
        mode: 'record',
      };
    } else {
      snapshot = { name: '临时测试', url: input.url || '', goal: input.case || '', mode: 'record' };
    }
    const [run] = await tx
      .insert(testRuns)
      .values({ ...snapshot, workerId: owner, status: 'running' })
      .returning();
    return runRecord(run);
  });
}
export async function appendEvent(id: string, message: string) {
  const event = JSON.stringify([{ at: new Date().toISOString(), message }]);
  await db
    .update(testRuns)
    .set({ events: sql`${testRuns.events} || ${event}::jsonb` })
    .where(eq(testRuns.id, id));
}
export async function savePlan(id: string, plan: TestRun['plan']) {
  await db.update(testRuns).set({ plan }).where(eq(testRuns.id, id));
}
export async function heartbeat(id: string) {
  const [run] = await db
    .update(testRuns)
    .set({ heartbeatAt: new Date().toISOString() })
    .where(and(eq(testRuns.id, id), eq(testRuns.workerId, owner), eq(testRuns.status, 'running')))
    .returning({ cancelRequested: testRuns.cancelRequested });
  return run;
}
export async function requestCancellation(id: string) {
  const [run] = await db
    .update(testRuns)
    .set({ cancelRequested: true })
    .where(and(eq(testRuns.id, id), eq(testRuns.status, 'running')))
    .returning();
  if (!run) throw new WorkspaceError('该测试已结束或不存在。', 409);
}
export async function finishRun(
  id: string,
  status: TestRun['status'],
  startedAt: string,
  error?: string,
) {
  const steps = await db
    .select({ replayable: runSteps.replayable, status: runSteps.status })
    .from(runSteps)
    .where(eq(runSteps.runId, id));
  const finishedAt = new Date().toISOString();
  await db
    .update(testRuns)
    .set({
      status: sql`case when ${testRuns.cancelRequested} then 'cancelled' else ${status} end`,
      finishedAt,
      durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
      error,
      replayable: sql`not ${testRuns.cancelRequested} and ${status === 'passed' && steps.length > 0 && steps.every((step) => step.replayable && step.status === 'passed')}`,
    })
    .where(and(eq(testRuns.id, id), eq(testRuns.status, 'running')));
  await db
    .update(runSteps)
    .set({
      status: 'failed',
      finishedAt,
      error: error || '执行中断',
      durationMs: sql`greatest(0, round(extract(epoch from (${finishedAt}::timestamptz - ${runSteps.startedAt})) * 1000))::integer`,
    })
    .where(and(eq(runSteps.runId, id), eq(runSteps.status, 'running')));
}
export async function insertStep(step: ExecutionStep) {
  await db.insert(runSteps).values(step);
}
export async function finishStep(id: string, patch: Partial<ExecutionStep>) {
  await db.update(runSteps).set(patch).where(eq(runSteps.id, id));
}
export async function insertArtifact(artifact: RunArtifact, path: string) {
  await db.insert(runArtifacts).values({ ...artifact, path });
}
export async function getArtifact(runId: string, id: string) {
  const [artifact] = await db
    .select()
    .from(runArtifacts)
    .where(and(eq(runArtifacts.runId, runId), eq(runArtifacts.id, id)));
  if (!artifact) throw new WorkspaceError('画面附件不存在。', 404);
  return artifact;
}

export async function listRecordingVersions(runId: string) {
  await getRun(runId);
  return db
    .select()
    .from(recordingVersions)
    .where(eq(recordingVersions.runId, runId))
    .orderBy(desc(recordingVersions.createdAt), desc(recordingVersions.id));
}
export async function saveRecordingVersion(runId: string, code: string) {
  const run = await getRun(runId);
  if (run.status === 'running') throw new WorkspaceError('请等待录制结束后编辑。', 409);
  let steps: ExecutionStep[];
  try {
    steps = parseRecordingScript(code);
  } catch (error) {
    throw new WorkspaceError(
      error instanceof ScriptError
        ? error.message
        : '等待参数须为有效条件，超时范围为 1000–5000 毫秒。',
    );
  }
  for (const step of steps) {
    if (step.planNodeId && !run.plan?.nodes[step.planNodeId])
      throw new WorkspaceError(`计划节点 ${step.planNodeId} 不存在。`);
  }
  const [version] = await db.insert(recordingVersions).values({ runId, code, steps }).returning();
  return version;
}

export async function appendBrowserLogs(id: string, logs: import('./types').BrowserLog[]) {
  if (!logs.length) return;
  await db
    .update(testRuns)
    .set({
      browserLogs: sql`${testRuns.browserLogs} || ${JSON.stringify(logs)}::jsonb`,
    })
    .where(eq(testRuns.id, id));
}
