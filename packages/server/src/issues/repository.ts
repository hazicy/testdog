import {
  ownershipValues,
  rowScope,
  ownedBy,
  type UserScope,
} from '@testdog/server/shared/ownership';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@testdog/server/db';
import {
  issues,
  issueOccurrences,
  issueVerifications,
  testRuns,
  testCases,
  runSteps,
  runArtifacts,
} from '@testdog/server/db/schema';
import { WorkspaceError } from '@testdog/server/shared/errors';
import { pageCursor, searchPattern, type PageQuery } from '@testdog/server/shared/pagination';
import { createRun } from '@testdog/server/runs/submission';
import { getRun } from '@testdog/server/runs/repository';
import { stepRecord } from '@testdog/server/runs/mappers';
import {
  issueInput,
  issueUpdate,
  occurrenceInput,
  verificationInput,
} from '@testdog/contracts/issues/schemas';
import { issueStatuses, type OccurrenceSnapshot } from '@testdog/contracts/issues/types';
import { verificationResult } from '@testdog/contracts/issues/lib/verification';
import { isActiveRun } from '@testdog/contracts/runs/types';
import { targetUrl } from '@testdog/contracts/execution/target';
import type { z } from 'zod';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function issueFor(tx: Tx | typeof db, id: string, userId: UserScope, lock = false) {
  const query = tx
    .select()
    .from(issues)
    .where(and(eq(issues.id, id), ownedBy(issues, userId)));
  const [issue] = await (lock ? query.for('update') : query);

  if (!issue) throw new WorkspaceError('问题不存在。', 404);

  return issue;
}

async function sourceSnapshot(tx: Tx, input: z.infer<typeof occurrenceInput>, userId: UserScope) {
  const [run] = await tx
    .select()
    .from(testRuns)
    .where(and(eq(testRuns.id, input.runId), ownedBy(testRuns, userId)));

  if (!run) throw new WorkspaceError('执行记录不存在。', 404);
  const [step] = input.stepId
    ? await tx
        .select()
        .from(runSteps)
        .where(and(eq(runSteps.id, input.stepId), eq(runSteps.runId, run.id)))
    : [];

  if (input.stepId && !step) throw new WorkspaceError('步骤不存在或不属于该执行。', 404);
  const artifacts = await tx
    .select({
      id: runArtifacts.id,
      runId: runArtifacts.runId,
      stepId: runArtifacts.stepId,
      kind: runArtifacts.kind,
      stage: runArtifacts.stage,
      pageId: runArtifacts.pageId,
      pageUrl: runArtifacts.pageUrl,
      capturedAt: runArtifacts.capturedAt,
      elapsedMs: runArtifacts.elapsedMs,
      contentType: runArtifacts.contentType,
      size: runArtifacts.size,
    })
    .from(runArtifacts)
    .where(
      and(
        eq(runArtifacts.runId, run.id),
        input.stepId ? eq(runArtifacts.stepId, input.stepId) : undefined,
      ),
    );
  const planNode = step?.planNodeId ? run.plan?.nodes[step.planNodeId] : undefined;
  const snapshot: OccurrenceSnapshot = {
    name: run.name,
    goal: run.goal,
    url: targetUrl(run.targetSnapshot),
    testId: run.testId ?? undefined,
    target: run.targetSnapshot,
    environment: run.environmentSnapshot ?? undefined,
    step: step ? stepRecord(step) : undefined,
    runStatus: run.status,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt ?? undefined,
    durationMs: run.durationMs ?? undefined,
    reproduction: (
      await tx
        .select({ title: runSteps.title })
        .from(runSteps)
        .where(
          and(
            eq(runSteps.runId, run.id),
            step ? sql`${runSteps.sequence} <= ${step.sequence}` : undefined,
          ),
        )
        .orderBy(runSteps.sequence)
    ).map((item) => item.title),
    artifacts: artifacts.map((item) => ({ ...item, stepId: item.stepId ?? undefined })),
    error: (step ? step.error : run.error) ?? undefined,
    nodeGoal: planNode
      ? planNode.kind === 'branch'
        ? planNode.condition
        : planNode.goal
      : undefined,
  };

  return snapshot;
}

export async function listIssues(
  page: PageQuery,
  userId: UserScope,
  filters: { platform?: string; days?: number; sort?: string; runId?: string } = {},
) {
  if (filters.platform && !['all', 'web', 'android', 'ios'].includes(filters.platform))
    throw new WorkspaceError('环境筛选无效。');
  if (filters.days !== undefined && ![1, 7, 30].includes(filters.days))
    throw new WorkspaceError('日期筛选无效。');
  if (page.status !== 'all' && !Object.hasOwn(issueStatuses, page.status))
    throw new WorkspaceError('问题状态无效。');
  if (filters.sort && !['last_seen', 'updated'].includes(filters.sort))
    throw new WorkspaceError('排序无效。');
  const lastSeen = sql<string>`coalesce((select max(${issueOccurrences.createdAt}) from ${issueOccurrences} where ${issueOccurrences.issueId} = ${issues.id}), ${issues.createdAt})`;
  const sortDate = filters.sort === 'last_seen' ? lastSeen : issues.updatedAt;
  const rows = await db
    .select({ issue: issues, sortDate })
    .from(issues)
    .where(
      and(
        ownedBy(issues, userId),
        page.status !== 'all'
          ? eq(issues.status, page.status as keyof typeof issueStatuses)
          : undefined,
        filters.runId
          ? sql`exists (select 1 from ${issueOccurrences} where ${issueOccurrences.issueId} = ${issues.id} and ${issueOccurrences.runId} = ${filters.runId}::uuid)`
          : undefined,
        filters.platform && filters.platform !== 'all'
          ? sql`exists (select 1 from ${issueOccurrences} where ${issueOccurrences.issueId} = ${issues.id} and coalesce(${issueOccurrences.snapshot}->'target'->>'platform', 'web') = ${filters.platform})`
          : undefined,
        filters.days
          ? sql`coalesce((select max(${issueOccurrences.createdAt}) from ${issueOccurrences} where ${issueOccurrences.issueId} = ${issues.id}), ${issues.createdAt}) >= ${new Date(Date.now() - filters.days * 86400000).toISOString()}::timestamptz`
          : undefined,
        page.q ? sql`${issues.title} ilike ${searchPattern(page.q)}` : undefined,
        page.cursor
          ? sql`(${sortDate}, ${issues.id}) < (${page.cursor.date}::timestamptz, ${page.cursor.id}::uuid)`
          : undefined,
      ),
    )
    .orderBy(desc(sortDate), desc(issues.id))
    .limit(page.limit + 1);
  const items = rows.slice(0, page.limit);
  const last = items.at(-1);

  const allOccurrences = items.length
    ? await db
        .select()
        .from(issueOccurrences)
        .where(
          inArray(
            issueOccurrences.issueId,
            items.map((row) => row.issue.id),
          ),
        )
        .orderBy(desc(issueOccurrences.createdAt), desc(issueOccurrences.id))
    : [];

  return {
    issues: items.map(({ issue }) => {
      const occurrences = allOccurrences.filter((item) => item.issueId === issue.id);

      return {
        ...issue,
        runCount: new Set(occurrences.map((item) => item.runId)).size,
        lastSeen: occurrences[0]?.createdAt ?? issue.createdAt,
        firstSeen: occurrences.at(-1)?.createdAt ?? issue.createdAt,
        latestOccurrence: occurrences[0] ?? null,
        ...(filters.runId
          ? { runOccurrences: occurrences.filter((item) => item.runId === filters.runId) }
          : {}),
      };
    }),
    nextCursor: rows.length > page.limit && last ? pageCursor(last.sortDate, last.issue.id) : null,
  };
}

export async function createIssue(input: z.infer<typeof issueInput>, userId: UserScope, tx: Tx) {
  const { source, ...values } = issueInput.parse(input);
  const snapshot = source ? await sourceSnapshot(tx, source, userId) : undefined;
  const [issue] = await tx
    .insert(issues)
    .values({ ...values, ...ownershipValues(userId) })
    .returning();

  if (source && snapshot)
    await tx.insert(issueOccurrences).values({
      issueId: issue.id,
      runId: source.runId,
      stepId: source.stepId,
      snapshot,
      createdAt: snapshot.finishedAt ?? snapshot.startedAt,
    });

  return issue;
}

export async function updateIssue(
  id: string,
  input: z.infer<typeof issueUpdate>,
  userId: UserScope,
) {
  const { version, closeReason, ...patch } = issueUpdate.parse(input);

  return db.transaction(async (tx) => {
    const before = await issueFor(tx, id, userId, true);
    const status = patch.status ?? before.status;
    const reason = status === 'closed' ? (closeReason ?? before.closeReason) : null;

    if (status === 'closed' && !reason) throw new WorkspaceError('请选择关闭原因。');
    if (closeReason && status !== 'closed')
      throw new WorkspaceError('仅关闭问题时可以设置关闭原因。');
    const [issue] = await tx
      .update(issues)
      .set({
        ...patch,
        closeReason: reason,
        version: version + 1,
        updatedAt: new Date().toISOString(),
      })
      .where(and(eq(issues.id, id), ownedBy(issues, userId), eq(issues.version, version)))
      .returning();

    if (!issue) throw new WorkspaceError('问题已被更新，请刷新后重试。', 409);

    return issue;
  });
}

export async function deleteIssue(id: string, userId: UserScope) {
  await db.transaction(async (tx) => {
    await issueFor(tx, id, userId, true);
    // Remove dependent links in order; their triggers notify related run views.
    await tx.delete(issueVerifications).where(eq(issueVerifications.issueId, id));
    await tx.delete(issueOccurrences).where(eq(issueOccurrences.issueId, id));
    await tx.delete(issues).where(and(eq(issues.id, id), ownedBy(issues, userId)));
  });
}

export async function linkOccurrence(
  id: string,
  input: z.infer<typeof occurrenceInput>,
  userId: UserScope,
) {
  return db.transaction(async (tx) => {
    await issueFor(tx, id, userId, true);
    const snapshot = await sourceSnapshot(tx, occurrenceInput.parse(input), userId);
    const [occurrence] = await tx
      .insert(issueOccurrences)
      .values({
        issueId: id,
        ...input,
        snapshot,
        createdAt: snapshot.finishedAt ?? snapshot.startedAt,
      })
      .onConflictDoNothing()
      .returning();

    if (occurrence) {
      await tx
        .update(issues)
        .set({ version: sql`${issues.version} + 1`, updatedAt: new Date().toISOString() })
        .where(eq(issues.id, id));
    }

    return { linked: true };
  });
}

export async function startVerification(
  id: string,
  input: z.infer<typeof verificationInput>,
  userId: UserScope,
  tx: Tx,
) {
  await issueFor(tx, id, userId, true);
  const [source] = await tx
    .select()
    .from(issueOccurrences)
    .where(and(eq(issueOccurrences.id, input.occurrenceId), eq(issueOccurrences.issueId, id)));

  if (!source) throw new WorkspaceError('问题出现记录不存在。', 404);
  const existing = await tx
    .select({ status: testRuns.status })
    .from(issueVerifications)
    .innerJoin(testRuns, eq(testRuns.id, issueVerifications.runId))
    .where(eq(issueVerifications.issueId, id));

  if (existing.some((row) => isActiveRun(row.status)))
    throw new WorkspaceError('已有回归执行正在进行，请等待完成。', 409);
  if (!input.recordingVersionId && !source.snapshot.testId)
    throw new WorkspaceError('原用例已删除或为临时测试，请先在执行记录保存修正后的录制版本。');
  const run = await createRun(
    input.recordingVersionId
      ? { mode: 'replay', sourceRunId: source.runId, recordingVersionId: input.recordingVersionId }
      : { testId: source.snapshot.testId!, target: source.snapshot.target },
    tx,
    userId,
  );

  await tx
    .insert(issueVerifications)
    .values({ issueId: id, occurrenceId: source.id, runId: run.id });
  await tx
    .update(issues)
    .set({
      status: 'pending_verification',
      closeReason: null,
      version: sql`${issues.version} + 1`,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(issues.id, id));

  return run;
}

export async function getIssue(id: string, userId: UserScope) {
  const issue = await issueFor(db, id, userId);
  const occurrences = await db
    .select()
    .from(issueOccurrences)
    .where(eq(issueOccurrences.issueId, id))
    .orderBy(desc(issueOccurrences.createdAt), desc(issueOccurrences.id));
  const rows = await db
    .select()
    .from(issueVerifications)
    .where(eq(issueVerifications.issueId, id))
    .orderBy(desc(issueVerifications.createdAt));
  const verifications = await Promise.all(
    rows.map(async (row) => {
      const run = await getRun(row.runId, { userId });
      const source = occurrences.find((item) => item.id === row.occurrenceId)!;

      return { ...row, runStatus: run.status, ...verificationResult(source.snapshot, run) };
    }),
  );

  return { issue, occurrences, verifications };
}

// Called inside the run finalization transaction, after all evidence is saved.
export async function createIssuesForFailedRun(runId: string, tx: Tx) {
  const [run] = await tx.select().from(testRuns).where(eq(testRuns.id, runId)).for('update');

  if (!run || run.status !== 'failed') return;
  // Serialize repeat failures of a saved case so concurrent runs share one open issue.
  if (run.testId)
    await tx
      .select({ id: testCases.id })
      .from(testCases)
      .where(eq(testCases.id, run.testId))
      .for('update');
  const failures = await tx
    .select()
    .from(runSteps)
    .where(and(eq(runSteps.runId, runId), eq(runSteps.status, 'failed')))
    .orderBy(runSteps.sequence);
  const [verification] = await tx
    .select({ issueId: issueVerifications.issueId, snapshot: issueOccurrences.snapshot })
    .from(issueVerifications)
    .innerJoin(issueOccurrences, eq(issueOccurrences.id, issueVerifications.occurrenceId))
    .where(eq(issueVerifications.runId, runId));

  for (const step of failures.length ? failures : [undefined]) {
    const source = { runId, ...(step ? { stepId: step.id } : {}) };
    const [existingSource] = await tx
      .select({ id: issueOccurrences.id })
      .from(issueOccurrences)
      .where(
        and(
          eq(issueOccurrences.runId, runId),
          step ? eq(issueOccurrences.stepId, step.id) : sql`${issueOccurrences.stepId} is null`,
        ),
      );

    if (existingSource) continue;
    const category = step?.kind === 'assertion' ? 'product' : 'execution';
    const snapshot = await sourceSnapshot(tx, source, rowScope(run));
    const [matching] = run.testId
      ? await tx
          .select({ id: issues.id })
          .from(issues)
          .innerJoin(issueOccurrences, eq(issueOccurrences.issueId, issues.id))
          .where(
            and(
              ownedBy(issues, rowScope(run)),
              inArray(issues.status, ['open', 'in_progress', 'pending_verification']),
              eq(issues.category, category),
              sql`${issueOccurrences.snapshot}->>'testId' = ${run.testId}`,
              sql`coalesce(${issueOccurrences.snapshot}->'step'->>'title', '') = ${step?.title ?? ''}`,
              sql`coalesce(${issueOccurrences.snapshot}->'step'->>'planNodeId', '') = ${step?.planNodeId ?? ''}`,
              sql`coalesce(${issueOccurrences.snapshot}->'step'->'assertion'->>'description', '') = ${step?.assertion?.description ?? ''}`,
              sql`coalesce(${issueOccurrences.snapshot}->'target', 'null'::jsonb) = ${JSON.stringify(snapshot.target ?? null)}::jsonb`,
            ),
          )
          .orderBy(desc(issues.updatedAt))
          .limit(1)
          .for('update', { of: issues })
      : [];
    const verificationMatches =
      verification &&
      (!verification.snapshot.step ||
        (verification.snapshot.step.planNodeId === step?.planNodeId &&
          verification.snapshot.step.title === step?.title &&
          verification.snapshot.step.assertion?.description === step?.assertion?.description));
    const issueId = (verificationMatches ? verification.issueId : undefined) ?? matching?.id;

    if (issueId) {
      await tx.insert(issueOccurrences).values({
        issueId,
        ...source,
        snapshot,
        createdAt: snapshot.finishedAt ?? snapshot.startedAt,
      });
      await tx
        .update(issues)
        .set({ version: sql`${issues.version} + 1`, updatedAt: new Date().toISOString() })
        .where(eq(issues.id, issueId));
    } else {
      await createIssue(
        issueInput.parse({
          title: (step?.title || run.name || '测试执行失败').slice(0, 200),
          category,
          severity: 'medium',
          source,
        }),
        rowScope(run),
        tx,
      );
    }
  }
}
