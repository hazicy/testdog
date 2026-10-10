import { ownedBy, type UserScope } from '@/server/shared/ownership';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { recordingVersions, testRuns } from '@/db/schema';
import { parseRecordingScript, ScriptError } from '@/features/runs/lib/recordingScript';
import { isActiveRun } from '@/features/runs/types';
import { parseDeviceRecordingScript } from '@/features/runs/lib/deviceRecording';
import type { ExecutionStep } from '@/features/runs/types';
import { WorkspaceError } from '@/server/shared/errors';
import { recoverExpiredRuns } from './runLifecycle';
import { recordingCodeSchema, recordingInputMessage } from '@/features/runs/schemas';

const recordingVersionFields = {
  id: recordingVersions.id,
  runId: recordingVersions.runId,
  code: recordingVersions.code,
  createdAt: recordingVersions.createdAt,
  platform: recordingVersions.platform,
  targetSnapshot: recordingVersions.targetSnapshot,
  schemaVersion: recordingVersions.schemaVersion,
};

export async function listRecordingVersions(runId: string, userId?: UserScope) {
  await recoverExpiredRuns();
  const [run] = await db
    .select({ id: testRuns.id })
    .from(testRuns)
    .where(
      and(
        eq(testRuns.id, runId),
        userId === undefined ? undefined : ownedBy(testRuns.userId, userId),
      ),
    );

  if (!run) throw new WorkspaceError('执行记录不存在。', 404);

  return db
    .select(recordingVersionFields)
    .from(recordingVersions)
    .where(eq(recordingVersions.runId, runId))
    .orderBy(desc(recordingVersions.createdAt), desc(recordingVersions.id));
}

export async function saveRecordingVersion(runId: string, code: string, userId?: UserScope) {
  const parsed = recordingCodeSchema.safeParse(code);

  if (!parsed.success) throw new WorkspaceError(recordingInputMessage);
  await recoverExpiredRuns();
  const [run] = await db
    .select({
      status: testRuns.status,
      plan: testRuns.plan,
      targetSnapshot: testRuns.targetSnapshot,
    })
    .from(testRuns)
    .where(
      and(
        eq(testRuns.id, runId),
        userId === undefined ? undefined : ownedBy(testRuns.userId, userId),
      ),
    );

  if (!run) throw new WorkspaceError('执行记录不存在。', 404);
  if (isActiveRun(run.status)) throw new WorkspaceError('请等待录制结束后编辑。', 409);
  let steps: ExecutionStep[];

  try {
    steps =
      run.targetSnapshot && run.targetSnapshot.platform !== 'web'
        ? parseDeviceRecordingScript(code, run.targetSnapshot.platform)
        : parseRecordingScript(code);
  } catch (error) {
    throw new WorkspaceError(
      error instanceof ScriptError
        ? error.message
        : '等待参数须为有效条件，超时范围为 1000–5000 毫秒。',
    );
  }

  for (const step of steps) {
    if (step.planNodeId && (!run.plan || !Object.hasOwn(run.plan.nodes, step.planNodeId)))
      throw new WorkspaceError(`计划节点 ${step.planNodeId} 不存在。`);
  }

  const [version] = await db
    .insert(recordingVersions)
    .values({
      runId,
      code,
      steps,
      platform: run.targetSnapshot?.platform ?? 'web',
      targetSnapshot: run.targetSnapshot,
    })
    .returning(recordingVersionFields);

  return version;
}
