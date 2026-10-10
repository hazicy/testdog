import { z } from 'zod';
import { NativeActionSchema, PlatformAssertionSchema } from '@/automation/platform/contracts';
import type { ExecutionStep } from './types';
const entrySchema = z
  .strictObject({
    title: z.string().trim().min(1),
    planNodeId: z.string().min(1).optional(),
    action: NativeActionSchema.optional(),
    check: PlatformAssertionSchema.optional(),
    assertion: z.strictObject({ description: z.string().trim().min(1) }).optional(),
    condition: z.string().trim().min(1).optional(),
    decision: z.boolean().optional(),
  })
  .superRefine((step, ctx) => {
    if ([step.action, step.assertion, step.check, step.condition].filter(Boolean).length !== 1)
      ctx.addIssue({
        code: 'custom',
        message: '每步须包含且仅包含一个 action、assertion 或 condition',
      });
    if (step.condition && step.decision === undefined)
      ctx.addIssue({ code: 'custom', message: '分支需要原始 decision' });
    if (step.action && 'target' in step.action && step.action.target.kind === 'ref')
      ctx.addIssue({ code: 'custom', message: '重放不能保存临时 ref，请使用稳定标识或唯一标签' });
    if (
      step.check?.platform === 'web' ||
      (step.check?.target && 'kind' in step.check.target && step.check.target.kind === 'ref')
    )
      ctx.addIssue({ code: 'custom', message: '原生检查必须使用稳定设备定位' });
    if (step.action?.type === 'swipe')
      ctx.addIssue({ code: 'custom', message: '坐标手势不支持稳定重放' });
  });
const schema = z.strictObject({
  schemaVersion: z.literal(1),
  platform: z.enum(['android', 'ios']),
  steps: z.array(entrySchema).min(1).max(200),
});
export function deviceRecordingScript(platform: 'android' | 'ios', steps: ExecutionStep[]) {
  return JSON.stringify(
    {
      schemaVersion: 1,
      platform,
      steps: steps.map((step) => ({
        title: step.title,
        ...(step.planNodeId ? { planNodeId: step.planNodeId } : {}),
        ...(step.platformAction?.platform !== 'web' && step.platformAction
          ? { action: step.platformAction.action }
          : {}),
        ...(step.platformAssertion ? { check: step.platformAssertion } : {}),
        ...(step.assertion ? { assertion: step.assertion } : {}),
        ...(step.condition ? { condition: step.condition, decision: step.decision } : {}),
      })),
    },
    null,
    2,
  );
}
export function parseDeviceRecordingScript(
  code: string,
  platform: 'android' | 'ios',
): ExecutionStep[] {
  const recording = schema.parse(JSON.parse(code));
  if (
    recording.platform !== platform ||
    recording.steps.some((entry) => entry.check && entry.check.platform !== platform)
  )
    throw new Error('录制平台不兼容');
  return recording.steps.map((entry, index) => ({
    id: `edited-device-${index + 1}`,
    runId: '',
    sequence: index + 1,
    kind:
      entry.action?.type === 'wait'
        ? 'wait'
        : entry.action
          ? 'action'
          : entry.assertion || entry.check
            ? 'assertion'
            : 'branch',
    title: entry.title,
    status: 'passed',
    startedAt: new Date(0).toISOString(),
    pageId: 'app',
    pageUrl: '',
    planNodeId: entry.planNodeId,
    platformAction: entry.action ? { schemaVersion: 1, platform, action: entry.action } : undefined,
    assertion: entry.assertion,
    platformAssertion: entry.check,
    condition: entry.condition,
    decision: entry.decision,
    replayable: true,
  }));
}
