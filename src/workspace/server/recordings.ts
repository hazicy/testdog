import { desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { recordingVersions, testRuns } from '@/db/schema';
import { parseRecordingScript, ScriptError } from '../recordingScript';
import type { ExecutionStep } from '../types';
import { WorkspaceError } from './errors';
import { recoverExpiredRuns } from './runLifecycle';
import { recordingCodeSchema, recordingInputMessage } from '../validation';

const recordingVersionFields = {
  id: recordingVersions.id,
  runId: recordingVersions.runId,
  code: recordingVersions.code,
  createdAt: recordingVersions.createdAt,
};
export async function listRecordingVersions(runId: string) {
  await recoverExpiredRuns();
  const [run] = await db.select({ id: testRuns.id }).from(testRuns).where(eq(testRuns.id, runId));
  if (!run) throw new WorkspaceError('执行记录不存在。', 404);
  return db
    .select(recordingVersionFields)
    .from(recordingVersions)
    .where(eq(recordingVersions.runId, runId))
    .orderBy(desc(recordingVersions.createdAt), desc(recordingVersions.id));
}
export async function saveRecordingVersion(runId: string, code: string) {
  const parsed = recordingCodeSchema.safeParse(code);
  if (!parsed.success) throw new WorkspaceError(recordingInputMessage);
  await recoverExpiredRuns();
  const [run] = await db
    .select({ status: testRuns.status, plan: testRuns.plan })
    .from(testRuns)
    .where(eq(testRuns.id, runId));
  if (!run) throw new WorkspaceError('执行记录不存在。', 404);
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
    if (step.planNodeId && (!run.plan || !Object.hasOwn(run.plan.nodes, step.planNodeId)))
      throw new WorkspaceError(`计划节点 ${step.planNodeId} 不存在。`);
  }
  const [version] = await db
    .insert(recordingVersions)
    .values({ runId, code, steps })
    .returning(recordingVersionFields);
  return version;
}
