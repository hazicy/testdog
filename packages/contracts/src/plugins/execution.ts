import { z } from 'zod';

export const PluginInvocationSchema = z.strictObject({
  id: z.string().trim().min(1),
  config: z.record(z.string(), z.unknown()),
});
export const PluginActionSchema = z.strictObject({
  type: z.literal('plugin'),
  plugin: PluginInvocationSchema,
});
export type PluginAction = z.infer<typeof PluginActionSchema>;
export type PluginInvocation = z.infer<typeof PluginInvocationSchema>;

const jsonPointer = z.string().regex(/^(\/([^~]|~[01])*)*$/);

export const VolcengineSelectionSchema = z.strictObject({
  key: z.string().trim().min(1),
  group: z.string().trim().min(1),
});
export const VolcengineSettingsSchema = z.strictObject({
  urlIncludes: z.string().trim().min(1).default('/service/2/abtest_config/'),
  dataPath: jsonPointer.default('/data'),
  experiments: z
    .array(
      z.strictObject({
        key: z.string().trim().min(1),
        groups: z
          .array(
            z.strictObject({
              name: z.string().trim().min(1),
              value: z.json(),
              variantId: z.string().trim().min(1).optional(),
            }),
          )
          .min(1),
      }),
    )
    .superRefine((experiments, ctx) => {
      if (new Set(experiments.map((item) => item.key)).size !== experiments.length)
        ctx.addIssue({ code: 'custom', message: '实验 key 不能重复' });
      for (const experiment of experiments)
        if (new Set(experiment.groups.map((group) => group.name)).size !== experiment.groups.length)
          ctx.addIssue({ code: 'custom', message: `实验 ${experiment.key} 的组名不能重复` });
    })
    .default([]),
});
export type VolcengineSettings = z.infer<typeof VolcengineSettingsSchema>;
export type ExecutionPluginSettings = {
  id: string;
  config: VolcengineSettings;
  version: number;
};
export type PluginSettingsResponse = { settings: ExecutionPluginSettings[] };

export const VolcengineExperimentSchema = z.strictObject({
  experimentName: z.string().trim().min(1),
  urlIncludes: z.string().trim().min(1).default('/service/2/abtest_config/'),
  dataPath: z
    .string()
    .regex(/^(\/([^~]|~[01])*)*$/)
    .default('/data'),
  key: z.string().trim().min(1),
  value: z.json(),
  variantId: z.string().trim().min(1).optional(),
});
export type VolcengineExperiment = z.infer<typeof VolcengineExperimentSchema>;

// Configuration metadata is shared; browser/driver implementations stay in automation.
export const executionPlugins = [
  {
    id: 'volcengine-abtest',
    schema: z.union([VolcengineSelectionSchema, VolcengineExperimentSchema]),
    defaultConfig: { key: '', group: '' },
  },
] as const;

export function validatePlugin(invocation: PluginInvocation) {
  const plugin = executionPlugins.find((plugin) => plugin.id === invocation.id);

  if (!plugin) throw new Error(`未知执行插件：${invocation.id}`);

  return { id: plugin.id, config: plugin.schema.parse(invocation.config) };
}

/** Resolve saved selections once, before execution. Expanded invocations remain replayable snapshots. */
export function resolveExecutionPlugin(
  invocation: PluginInvocation,
  settings?: VolcengineSettings,
): PluginInvocation {
  validatePlugin(invocation);
  const resolved = VolcengineExperimentSchema.safeParse(invocation.config);

  if (resolved.success) return { id: invocation.id, config: resolved.data };
  const selection = VolcengineSelectionSchema.parse(invocation.config);

  if (!settings) throw new Error('请先在插件页配置火山实验插件');
  const experiment = settings.experiments.find((item) => item.key === selection.key);
  const group = experiment?.groups.find((item) => item.name === selection.group);

  if (!group) throw new Error(`插件中未配置实验组：${selection.key} / ${selection.group}`);

  return {
    id: invocation.id,
    config: VolcengineExperimentSchema.parse({
      experimentName: `${selection.key} · ${selection.group}`,
      urlIncludes: settings.urlIncludes,
      dataPath: settings.dataPath,
      key: selection.key,
      value: group.value,
      ...(group.variantId ? { variantId: group.variantId } : {}),
    }),
  };
}
