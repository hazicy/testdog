import { expect, it } from 'vitest';
import { experimentOverride } from './responseOverride';
import { ExecutablePlanSchema } from '@testdog/contracts/execution/plan';
import type { PluginInvocation } from '@testdog/contracts/plugins/execution';

const invocation = (config: Record<string, unknown> = {}): PluginInvocation => ({
  id: 'volcengine-abtest',
  config: {
    experimentName: 'Checkout',
    key: 'test/key',
    value: { group: 'B', enabled: true },
    ...config,
  },
});

it('uses an exact key, supports escaped JSON Pointer paths and preserves metadata', () => {
  const rule = experimentOverride(invocation({ dataPath: '/payload~1result/~0data' }));
  const body = {
    'payload/result': {
      '~data': {
        'test/key': { val: 'A', vid: 'original', extra: true },
        other: { val: 'untouched' },
      },
    },
  };

  expect(rule.apply(body)).toEqual({
    experimentName: 'Checkout',
    key: 'test/key',
    before: { val: 'A', vid: 'original' },
    after: { val: { group: 'B', enabled: true }, vid: 'original' },
  });
  expect(body['payload/result']['~data'].other.val).toBe('untouched');
  expect(body['payload/result']['~data']['test/key'].extra).toBe(true);
});

it('rejects unknown plugins, invalid config and nonexistent inherited properties', () => {
  expect(() => experimentOverride({ id: 'unknown', config: {} })).toThrow('未知执行插件');
  expect(() => experimentOverride(invocation({ key: '' }))).toThrow();
  expect(() => experimentOverride(invocation({ dataPath: 'data' }))).toThrow();
  expect(() => experimentOverride(invocation({ key: 'toString' })).apply({ data: {} })).toThrow(
    '不存在实验 key',
  );
  expect(() => experimentOverride(invocation()).apply({})).toThrow('数据路径不存在');
});

it('requires a valid plugin configuration when persisting or running a plan', () => {
  const plan = {
    rootId: 'plugin',
    nodes: {
      plugin: {
        id: 'plugin',
        kind: 'task',
        actionType: 'plugin',
        goal: 'Override',
        plugin: invocation(),
        dependsOn: [],
        requirementIds: [],
        assertions: [],
      },
    },
  };

  expect(ExecutablePlanSchema.safeParse(plan).success).toBe(true);
  expect(
    ExecutablePlanSchema.safeParse({
      ...plan,
      nodes: { plugin: { ...plan.nodes.plugin, plugin: undefined } },
    }).success,
  ).toBe(false);
});
