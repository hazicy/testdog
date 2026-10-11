import type { OccurrenceSnapshot, VerificationOutcome } from '../types';
import { isActiveRun, type TestRun } from '@/features/runs/types';

export function verificationResult(
  source: OccurrenceSnapshot,
  run: TestRun,
): { outcome: VerificationOutcome; explanation: string } {
  if (isActiveRun(run.status))
    return { outcome: 'pending', explanation: '等待执行和证据归档完成。' };
  if (run.status === 'cancelled' || run.evidenceComplete === false)
    return { outcome: 'inconclusive', explanation: '执行已停止或证据归档不完整。' };
  const original = source.step;

  if (!original)
    return run.status === 'passed'
      ? { outcome: 'passed', explanation: '完整用例执行通过；此问题未绑定单独步骤。' }
      : { outcome: 'inconclusive', explanation: '执行失败，请查看执行记录确认是否为同一问题。' };
  if (!original.planNodeId)
    return { outcome: 'inconclusive', explanation: '历史步骤缺少节点标识，请人工检查回归结果。' };
  const node = run.plan?.nodes[original.planNodeId];

  if (
    run.plan &&
    (!node ||
      (source.nodeGoal &&
        (node.kind === 'branch' ? node.condition : node.goal) !== source.nodeGoal))
  )
    return { outcome: 'inconclusive', explanation: '目标节点已删除或定义发生变化。' };
  const steps = run.steps.filter(
    (step) =>
      step.planNodeId === original.planNodeId &&
      (original.kind === 'assertion'
        ? step.kind === 'assertion' &&
          (original.assertion
            ? step.assertion?.description === original.assertion.description
            : step.title === original.title)
        : step.kind === original.kind && step.title === original.title),
  );

  if (!steps.length)
    return { outcome: 'inconclusive', explanation: '目标步骤未执行或断言已变更。' };
  if (steps.some((step) => step.status === 'failed'))
    return { outcome: 'failed', explanation: '关联目标再次执行失败。' };
  if (run.status !== 'passed' || steps.some((step) => step.status !== 'passed'))
    return { outcome: 'inconclusive', explanation: '目标步骤已执行，但整条测试未完整通过。' };

  return { outcome: 'passed', explanation: '关联目标执行通过，完整用例及证据归档完成。' };
}
