import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  issues,
  issueOccurrences,
  issueEvents,
  issueVerifications,
  testRuns,
  runSteps,
  runArtifacts,
} from '@/db/schema';
import { ownedBy, type UserScope } from '@/server/shared/ownership';
import { WorkspaceError } from '@/server/shared/errors';
import { pageCursor, searchPattern, type PageQuery } from '@/server/shared/pagination';
import { createRun, getRun } from '@/server/runs/repository';
import {
  issueInput,
  issueUpdate,
  occurrenceInput,
  verificationInput,
} from '@/features/issues/schemas';
import { closeReasons, issueStatuses, type OccurrenceSnapshot } from '@/features/issues/types';
import { verificationResult } from '@/features/issues/lib/verification';
import { isActiveRun } from '@/features/runs/types';
import type { z } from 'zod';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function issueFor(tx: Tx | typeof db, id: string, userId: UserScope, lock = false) {
  const query = tx
    .select()
    .from(issues)
    .where(and(eq(issues.id, id), ownedBy(issues.userId, userId)));
  const [issue] = await (lock ? query.for('update') : query);

  if (!issue) throw new WorkspaceError('问题不存在。', 404);

  return issue;
}

async function sourceSnapshot(tx: Tx, input: z.infer<typeof occurrenceInput>, userId: UserScope) {
  const [run] = await tx
    .select()
    .from(testRuns)
    .where(and(eq(testRuns.id, input.runId), ownedBy(testRuns.userId, userId)));

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
    url: run.url,
    testId: run.testId ?? undefined,
    target: run.targetSnapshot ?? undefined,
    environment: run.environmentSnapshot ?? undefined,
    step: step
      ? (Object.fromEntries(
          Object.entries(step).map(([key, value]) => [key, value ?? undefined]),
        ) as OccurrenceSnapshot['step'])
      : undefined,
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

export async function listIssues(page: PageQuery, userId: UserScope) {
  if (page.status !== 'all' && !Object.hasOwn(issueStatuses, page.status))
    throw new WorkspaceError('问题状态无效。');
  const rows = await db
    .select()
    .from(issues)
    .where(
      and(
        ownedBy(issues.userId, userId),
        page.status !== 'all'
          ? eq(issues.status, page.status as keyof typeof issueStatuses)
          : undefined,
        page.q
          ? sql`concat_ws(' ', ${issues.title}, ${issues.description}) ilike ${searchPattern(page.q)}`
          : undefined,
        page.cursor
          ? sql`(${issues.updatedAt}, ${issues.id}) < (${page.cursor.date}::timestamptz, ${page.cursor.id}::uuid)`
          : undefined,
      ),
    )
    .orderBy(desc(issues.updatedAt), desc(issues.id))
    .limit(page.limit + 1);
  const items = rows.slice(0, page.limit);
  const last = items.at(-1);

  return {
    issues: items,
    nextCursor: rows.length > page.limit && last ? pageCursor(last.updatedAt, last.id) : null,
  };
}

export async function createIssue(input: z.infer<typeof issueInput>, userId: UserScope, tx: Tx) {
  const { source, ...values } = issueInput.parse(input);
  const snapshot = source ? await sourceSnapshot(tx, source, userId) : undefined;
  const [issue] = await tx
    .insert(issues)
    .values({ ...values, userId })
    .returning();

  if (source && snapshot)
    await tx
      .insert(issueOccurrences)
      .values({ issueId: issue.id, runId: source.runId, stepId: source.stepId, snapshot });
  await tx.insert(issueEvents).values({
    issueId: issue.id,
    kind: 'created',
    message: source ? '从测试执行创建问题。' : '创建问题。',
  });

  return issue;
}

export async function updateIssue(
  id: string,
  input: z.infer<typeof issueUpdate>,
  userId: UserScope,
) {
  const { version, comment, closeReason, ...patch } = issueUpdate.parse(input);

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
      .where(and(eq(issues.id, id), ownedBy(issues.userId, userId), eq(issues.version, version)))
      .returning();

    if (!issue) throw new WorkspaceError('问题已被更新，请刷新后重试。', 409);
    if (Object.keys(patch).length || closeReason)
      await tx.insert(issueEvents).values({
        issueId: id,
        kind: 'updated',
        message:
          before.status !== status
            ? `状态：${issueStatuses[before.status]} → ${issueStatuses[status]}${reason ? `（${closeReasons[reason]}）` : ''}`
            : '更新问题信息。',
      });
    if (comment)
      await tx.insert(issueEvents).values({ issueId: id, kind: 'comment', message: comment });

    return issue;
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
      .values({ issueId: id, ...input, snapshot })
      .onConflictDoNothing()
      .returning();

    if (occurrence) {
      await tx
        .update(issues)
        .set({ version: sql`${issues.version} + 1`, updatedAt: new Date().toISOString() })
        .where(eq(issues.id, id));
      await tx
        .insert(issueEvents)
        .values({ issueId: id, kind: 'occurrence', message: `关联执行：${snapshot.name}` });
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
  await tx
    .insert(issueEvents)
    .values({ issueId: id, kind: 'verification', message: `发起回归验证：${run.name}` });

  return run;
}

export async function getIssue(id: string, userId: UserScope) {
  const issue = await issueFor(db, id, userId);
  const occurrences = await db
    .select()
    .from(issueOccurrences)
    .where(eq(issueOccurrences.issueId, id))
    .orderBy(desc(issueOccurrences.createdAt), desc(issueOccurrences.id));
  const events = await db
    .select()
    .from(issueEvents)
    .where(eq(issueEvents.issueId, id))
    .orderBy(desc(issueEvents.createdAt), desc(issueEvents.id));
  const rows = await db
    .select()
    .from(issueVerifications)
    .where(eq(issueVerifications.issueId, id))
    .orderBy(desc(issueVerifications.createdAt));
  const verifications = await Promise.all(
    rows.map(async (row) => {
      const run = await getRun(row.runId, { userId, includeLogs: false });
      const source = occurrences.find((item) => item.id === row.occurrenceId)!;

      return { ...row, runStatus: run.status, ...verificationResult(source.snapshot, run) };
    }),
  );

  return { issue, occurrences, events, verifications };
}
