import {
  validatePlugin,
  VolcengineExperimentSchema,
  type PluginInvocation,
} from '@testdog/contracts/plugins/execution';

type JsonObject = Record<string, unknown>;
const object = (value: unknown): value is JsonObject =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Locate only existing own properties, including keys containing dots or slashes. */
export function experimentOverride(invocation: PluginInvocation) {
  validatePlugin(invocation);
  const config = VolcengineExperimentSchema.parse(invocation.config);
  const identity = JSON.stringify([config.urlIncludes, config.dataPath, config.key]);

  return {
    identity,
    urlIncludes: config.urlIncludes,
    experimentName: config.experimentName,
    key: config.key,
    apply(body: unknown) {
      let data: unknown = body;

      for (const part of config.dataPath ? config.dataPath.slice(1).split('/') : []) {
        const key = part.replace(/~1/g, '/').replace(/~0/g, '~');

        if (!object(data) || !Object.hasOwn(data, key))
          throw new Error(`响应数据路径不存在：${config.dataPath}`);
        data = data[key];
      }

      if (!object(data) || !Object.hasOwn(data, config.key))
        throw new Error(`响应中不存在实验 key：${config.key}`);
      const entry = data[config.key];

      if (!object(entry) || !Object.hasOwn(entry, 'val'))
        throw new Error(`实验 ${config.key} 缺少 val 字段`);
      if (config.variantId !== undefined && !Object.hasOwn(entry, 'vid'))
        throw new Error(`实验 ${config.key} 缺少 vid 字段`);
      const before = {
        val: structuredClone(entry.val),
        ...(Object.hasOwn(entry, 'vid') ? { vid: structuredClone(entry.vid) } : {}),
      };

      entry.val = structuredClone(config.value);
      if (config.variantId !== undefined) entry.vid = config.variantId;
      const after = {
        val: structuredClone(entry.val),
        ...(Object.hasOwn(entry, 'vid') ? { vid: structuredClone(entry.vid) } : {}),
      };

      return { experimentName: config.experimentName, key: config.key, before, after };
    },
  };
}
