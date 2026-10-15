import { z } from 'zod';
import {
  NativeActionSchema,
  PlatformAssertionSchema,
} from '@testdog/contracts/automation/platform/contracts';
import type { RecordingOperation } from '@testdog/contracts/runs/types';

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
      ctx.addIssue({
        code: 'custom',
        message: '重新运行不能使用临时 ref，请使用稳定标识或唯一标签',
      });
    if (
      step.check?.platform === 'web' ||
      (step.check?.target && 'kind' in step.check.target && step.check.target.kind === 'ref')
    )
      ctx.addIssue({ code: 'custom', message: '原生检查必须使用稳定设备定位' });
    if (step.action?.type === 'swipe')
      ctx.addIssue({ code: 'custom', message: '坐标手势无法可靠地重复执行' });
  });

const schema = z.strictObject({
  schemaVersion: z.literal(1),
  platform: z.enum(['android', 'ios']),
  steps: z.array(entrySchema).min(1).max(200),
});

export function deviceRecordingScript(platform: 'android' | 'ios', steps: RecordingOperation[]) {
  return JSON.stringify(
    {
      schemaVersion: 1,
      platform,
      steps: steps.map((step) => ({
        title: step.title,
        planNodeId: step.planNodeId || undefined,
        action: step.action?.platform !== 'web' ? step.action?.action : undefined,
        check: step.platformAssertion,
        assertion: step.assertion,
        condition: step.condition || undefined,
        decision: step.condition ? step.decision : undefined,
      })),
    },
    null,
    2,
  );
}

export function parseDeviceRecordingScript(
  code: string,
  platform: 'android' | 'ios',
): RecordingOperation[] {
  const recording = schema.parse(JSON.parse(code));

  if (
    recording.platform !== platform ||
    recording.steps.some((entry) => entry.check && entry.check.platform !== platform)
  )
    throw new Error('录制平台不兼容');

  return recording.steps.map((entry) => ({
    kind:
      entry.action?.type === 'wait'
        ? 'wait'
        : entry.action
          ? 'action'
          : entry.assertion || entry.check
            ? 'assertion'
            : 'branch',
    title: entry.title,
    pageId: 'app',
    planNodeId: entry.planNodeId,
    action: entry.action ? { schemaVersion: 1, platform, action: entry.action } : undefined,
    assertion: entry.assertion,
    platformAssertion: entry.check,
    condition: entry.condition,
    decision: entry.decision,
  }));
}
