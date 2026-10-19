import { expect, it } from 'vitest';
import { ExecutablePlanSchema } from '@testdog/contracts/automation/compiler/schema';
import { emptyPlan, planText } from './authoring';
import { pasteFeishuPlan } from './pasteFeishuPlan';

const shape = (id: string, text: string, parentId = '') => ({
  id,
  type: 24,
  info: {
    baseV2: { x: 0, y: 0, width: 150, height: 50 },
    textV2: { text },
    mindMap: { parentId },
  },
});
const html = (data: unknown[], resource: unknown[] = []) =>
  `<span data-info="--%whiteboard-x--${btoa(encodeURIComponent(JSON.stringify({ data, resource })))}--whiteboard-x%--"></span>`;

it('imports hierarchy, steps and child expectations into a valid editable plan', () => {
  const original = emptyPlan('现有测试');
  const source = html([
    shape('root', '登录测试'),
    shape('group', '账号场景', 'root'),
    shape('step', '步骤：登录\n输入账号', 'group'),
    shape('expect', '预期：进入首页', 'step'),
    shape('expect2', '预期结果：显示头像', 'step'),
    shape('other', '关闭弹窗', 'group'),
  ]);
  const imported = pasteFeishuPlan(original, source)!.plan;

  expect(ExecutablePlanSchema.safeParse(imported).success).toBe(true);
  expect(Object.values(imported.nodes)).toContainEqual(
    expect.objectContaining({
      kind: 'task',
      actionType: 'act',
      goal: '登录\n输入账号',
      assertions: [{ description: '进入首页' }, { description: '显示头像' }],
    }),
  );
  expect(planText(imported)).toContain('登录测试\n    账号场景\n      act: 登录');
  expect(original).toEqual(emptyPlan('现有测试'));
  const repeated = pasteFeishuPlan(imported, source)!.plan;

  expect(Object.keys(repeated.nodes)).toHaveLength(Object.keys(imported.nodes).length * 2 - 1);
  expect(ExecutablePlanSchema.safeParse(repeated).success).toBe(true);
});

it('imports a selected subtree, standalone expectations and inline expectations', () => {
  const imported = pasteFeishuPlan(
    emptyPlan('测试'),
    html([
      shape('a', '预期：按钮可见', 'external'),
      shape('b', '步骤：点击登录\n预期：进入首页\n显示欢迎信息', 'external'),
    ]),
  )!.plan;

  expect(Object.values(imported.nodes)).toContainEqual(
    expect.objectContaining({
      actionType: 'assert',
      goal: '按钮可见',
      assertions: [{ description: '按钮可见' }],
    }),
  );
  expect(Object.values(imported.nodes)).toContainEqual(
    expect.objectContaining({
      actionType: 'act',
      goal: '点击登录',
      assertions: [{ description: '进入首页\n显示欢迎信息' }],
    }),
  );
});

it('skips blank image nodes, preserves their textual descendants and reports image loss', () => {
  const imported = pasteFeishuPlan(
    emptyPlan('测试'),
    html(
      [shape('a', '', 'external'), shape('b', '操作步骤：提交', 'a'), shape('c', '', 'b')],
      [{ key: 'private-resource', type: 1, refId: 'r1:1' }],
    ),
  )!;

  expect(imported.skippedImages).toBe(1);
  expect(Object.values(imported.plan.nodes).filter((node) => node.kind === 'task')).toHaveLength(1);
  expect(planText(imported.plan)).toContain('act: 提交');
  expect(JSON.stringify(imported.plan)).not.toContain('private-resource');
});

it('keeps labelled parent steps when they contain nested steps', () => {
  const imported = pasteFeishuPlan(
    emptyPlan('测试'),
    html([shape('a', '步骤：打开页面'), shape('b', '步骤：点击登录', 'a')]),
  )!.plan;

  expect(planText(imported)).toContain('act: 打开页面\n    act: 点击登录');
});

it('does not consume ordinary HTML or partially import invalid content', () => {
  const plan = emptyPlan('测试');

  expect(pasteFeishuPlan(plan, '<p>普通文字</p>')).toBeNull();
  for (const source of [
    html([shape('a', '')]),
    html([shape('a', '预期：')]),
    html([shape('a', '步骤：')]),
    html([{ ...shape('a', '普通图形'), type: 1 }]),
  ])
    expect(() => pasteFeishuPlan(plan, source)).toThrow();
  expect(plan).toEqual(emptyPlan('测试'));
});
