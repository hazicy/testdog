import { parse, type Node } from 'acorn';
import { type Target } from '@testdog/contracts/execution/plan';
import { WebActionSchema, PlatformAssertionSchema } from '@testdog/contracts/execution/platform';
import type { RecordingOperation } from '@testdog/contracts/runs/types';

// A validated Playwright call dialect. Parsed into operations, never evaluated as JavaScript.
type Ast = Node & {
  body?: Ast[];
  expression?: Ast;
  argument?: Ast;
  callee?: Ast;
  arguments?: Ast[];
  object?: Ast;
  property?: Ast;
  computed?: boolean;
  name?: string;
  value?: unknown;
  properties?: (Ast & { key: Ast; value: Ast; kind: string; method: boolean })[];
};
export class ScriptError extends Error {
  constructor(
    message: string,
    public line = 1,
  ) {
    super(`第 ${line} 行：${message}`);
  }
}
const assertionMethods = {
  visible: 'toBeVisible',
  text: 'toHaveText',
  containsText: 'toContainText',
  value: 'toHaveValue',
  url: 'toHaveURL',
} as const;
const assertionTypes = Object.fromEntries(
  Object.entries(assertionMethods).map(([type, method]) => [method, type]),
);
const quote = JSON.stringify;
const pageName = (id: string) => `page${id.replace('page-', '')}`;

function locator(page: string, target: Target): string {
  const methods = {
    role: 'getByRole',
    label: 'getByLabel',
    placeholder: 'getByPlaceholder',
    testId: 'getByTestId',
    text: 'getByText',
    css: 'locator',
    ariaRef: 'locator',
  };
  const value = target.kind === 'ariaRef' ? `aria-ref=${target.value}` : target.value;
  const options =
    target.kind === 'role' && target.name
      ? `, { name: ${quote(target.name)}, exact: true }`
      : ['label', 'placeholder', 'text'].includes(target.kind)
        ? ', { exact: true }'
        : '';

  const root = target.scope ? locator(page, target.scope) : page;

  return `${root}.${methods[target.kind]}(${quote(value)}${options})${target.index === undefined ? '' : `.nth(${target.index})`}`;
}

function operationScript(step: RecordingOperation) {
  const page = pageName(step.pageId);

  if (step.platformAssertion?.platform === 'web') {
    const assertion = step.platformAssertion;
    const subject = assertion.target ? locator(page, assertion.target) : page;
    const method = assertionMethods[assertion.type];
    const value = assertion.type === 'visible' ? '' : quote(assertion.value);

    return `await expect(${subject}).${assertion.negate ? 'not.' : ''}${method}(${value});`;
  }

  if (step.kind === 'assertion' && step.assertion)
    return `await expectPage(${page}, ${quote(step.assertion.description)});`;
  if (step.kind === 'branch' && step.condition)
    return `await expectBranch(${page}, ${quote(step.condition)}, ${step.decision ?? false});`;

  const action = step.action?.platform === 'web' ? step.action.action : undefined;

  if (!action) return '// 本步骤没有录制内容，请补充操作后保存。';

  switch (action.type) {
    case 'plugin':
      return `await runPlugin(${page}, ${quote(JSON.stringify(action.plugin))});`;
    case 'navigate':
      return `await ${page}.goto(${quote(action.value)});`;
    case 'screenshot':
      return `await ${page}.screenshot();`;
    case 'wait':
      return action.condition === 'observe'
        ? `await ${page}.waitForTimeout(${action.timeoutMs});`
        : `await waitFor(${page}, ${quote(action.condition)}, ${quote(action.value)}, ${action.timeoutMs});`;
    default:
      return `await ${locator(page, action.target)}.${action.type}(${action.type === 'click' ? '' : quote(action.value)});`;
  }
}

export function recordingScript(steps: RecordingOperation[]) {
  const lines = [
    '// page1 = 初始页面；page2、page3 = 按打开顺序编号的新标签页',
    '// expectPage 使用当前页面观测验证预期；expectBranch 验证分支条件',
    '',
  ];

  for (const step of steps) {
    lines.push(`// ${step.title.replace(/[\r\n]/g, ' ')}`);
    if (step.planNodeId) lines.push(`// @node ${step.planNodeId}`);
    lines.push(operationScript(step), '');
  }

  return lines.join('\n');
}

export function parseRecordingScript(code: string): RecordingOperation[] {
  if (code.length > 100000) throw new ScriptError('脚本最多 100,000 个字符');
  let program: Ast;

  try {
    program = parse(code, { ecmaVersion: 'latest', sourceType: 'module', locations: true }) as Ast;
  } catch (error) {
    const e = error as Error & { loc?: { line: number } };

    throw new ScriptError(e.message, e.loc?.line);
  }

  const steps: RecordingOperation[] = [];
  let line = 1;
  const fail = (message: string): never => {
    throw new ScriptError(message, line);
  };

  const literal = (node?: Ast): unknown => {
    if (node?.type === 'Literal' && ['string', 'number', 'boolean'].includes(typeof node.value))
      return node.value;
    if (node?.type === 'ObjectExpression') {
      const result: Record<string, unknown> = Object.create(null);

      for (const p of node.properties || []) {
        if (p.type !== 'Property' || p.computed || p.method || p.kind !== 'init')
          fail('选项只支持字面量属性');
        const key = p.key.name || String(p.key.value);

        if (Object.hasOwn(result, key)) fail('选项属性不能重复');
        result[key] = literal(p.value);
      }

      return result;
    }

    return fail('参数须为字符串、数字、布尔值或字面量选项');
  };

  const action = (value: unknown) => {
    const result = WebActionSchema.safeParse(value);

    if (!result.success)
      return fail('操作参数无效；等待条件支持 observe/newPage/url/text，时间为 1000–5000 毫秒');

    return { platform: 'web' as const, action: result.data };
  };

  const str = (node?: Ast) => {
    const value = literal(node);

    return typeof value === 'string' ? value : fail('此参数必须是字符串');
  };

  const pageId = (node?: Ast) =>
    node?.type === 'Identifier' && /^page[1-9]\d*$/.test(node.name || '')
      ? `page-${node!.name!.slice(4)}`
      : fail('页面须使用 page1、page2 等编号');
  const member = (node?: Ast) => {
    if (node?.type !== 'MemberExpression' || node.computed || node.property?.type !== 'Identifier')
      return fail('只支持明确的方法调用');

    return { object: node.object!, method: node.property.name! };
  };

  const readLocator = (node: Ast): { page: string; target: Target } => {
    if (node.type !== 'CallExpression') return fail('需要 Playwright 定位器');
    const { object, method } = member(node.callee);
    const args = node.arguments || [];

    if (method === 'nth') {
      const result = readLocator(object);
      const index = literal(args[0]);

      if (args.length !== 1 || typeof index !== 'number' || !Number.isInteger(index) || index < 0)
        fail('nth 需要非负整数');

      return { ...result, target: { ...result.target, index: index as number } };
    }

    const kinds: Record<string, Target['kind']> = {
      getByRole: 'role',
      getByLabel: 'label',
      getByPlaceholder: 'placeholder',
      getByTestId: 'testId',
      getByText: 'text',
      locator: 'css',
    };

    if (!kinds[method] || !args.length || args.length > 2)
      fail('支持 getByRole/getByLabel/getByPlaceholder/getByTestId/locator');
    const opts = args[1] ? literal(args[1]) : {};

    if (!opts || typeof opts !== 'object') fail('定位器选项须为对象');
    const options = opts as Record<string, unknown>;

    if (
      Object.keys(options).some((key) => !['name', 'exact'].includes(key)) ||
      (options.exact !== undefined && options.exact !== true)
    )
      fail('定位器选项支持 name 和 exact: true');
    if (options.name !== undefined && (method !== 'getByRole' || typeof options.name !== 'string'))
      fail('name 只用于 getByRole');
    if (['getByTestId', 'locator'].includes(method) && Object.keys(options).length)
      fail('此定位器不接受选项');
    const value = str(args[0]);

    if (
      !value.trim() ||
      (method === 'locator' && /aria-ref=|xpath=|^\/|nth-child|nth-of-type/.test(value))
    )
      fail('请使用稳定的语义定位器或 CSS；录制 aria-ref 需要替换');

    const target = { kind: kinds[method], value, name: String(options.name || '') };

    if (object.type === 'CallExpression') {
      const parent = readLocator(object);

      if (parent.target.scope || parent.target.index !== undefined)
        return fail('只支持一层唯一的区域定位');

      return { page: parent.page, target: { ...target, scope: parent.target } };
    }

    return { page: pageId(object), target };
  };

  // Helper calls, assertions and page actions have separate validation rules.
  const readHelper = (step: RecordingOperation, call: Ast) => {
    const args = call.arguments || [];
    const name = call.callee?.name;

    step.pageId = pageId(args[0]);
    if (name === 'runPlugin' && args.length === 2) {
      let plugin: unknown;

      try {
        plugin = JSON.parse(str(args[1]));
      } catch {
        fail('插件配置须为有效 JSON');
      }

      step.kind = 'action';
      step.action = action({ type: 'plugin', plugin });
      step.title = 'plugin';
    } else if (name === 'expectPage' && args.length === 2) {
      step.kind = 'assertion';
      step.assertion = { description: str(args[1]) };
      step.title = step.assertion.description;
      if (!step.title.trim()) fail('预期不能为空');
    } else if (name === 'expectBranch' && args.length === 3) {
      step.kind = 'branch';
      step.condition = str(args[1]);
      const expected = literal(args[2]);

      if (typeof expected !== 'boolean') fail('分支预期须为布尔值');
      step.decision = expected as boolean;
      step.title = `判断条件：${step.condition}`;
      if (!step.condition.trim()) fail('分支条件不能为空');
    } else if (name === 'waitFor' && args.length === 4) {
      step.kind = 'wait';
      step.action = action({
        type: 'wait',
        condition: str(args[1]),
        value: str(args[2]),
        timeoutMs: literal(args[3]),
      });
    } else
      fail(
        '支持 expectPage(page, description)、expectBranch(page, condition, boolean)、waitFor(page, condition, value, timeoutMs)',
      );
  };

  const readAssertion = (step: RecordingOperation, object: Ast, method: string, args: Ast[]) => {
    let expected = object;
    let negate = false;

    if (expected.type === 'MemberExpression') {
      const m = member(expected);

      if (m.method !== 'not') fail('断言仅支持 .not');
      expected = m.object;
      negate = true;
    }

    if (
      expected.type !== 'CallExpression' ||
      expected.callee?.type !== 'Identifier' ||
      expected.callee.name !== 'expect' ||
      expected.arguments?.length !== 1
    )
      fail('断言写法：await expect(locator).toBeVisible()');
    if (args.length !== (method === 'toBeVisible' ? 0 : 1)) fail('断言参数数量错误');
    const subject = expected.arguments![0];
    const target = method === 'toHaveURL' ? undefined : readLocator(subject);

    step.pageId = target ? target.page : pageId(subject);
    step.kind = 'assertion';
    step.platformAssertion = PlatformAssertionSchema.parse({
      platform: 'web',
      type: assertionTypes[method],
      target: target?.target,
      negate,
      ...(method !== 'toBeVisible' ? { value: str(args[0]) } : {}),
    });
    step.title = `${negate ? 'not.' : ''}${method} ${step.platformAssertion.value || target?.target.value || ''}`;
  };

  const readAction = (step: RecordingOperation, object: Ast, method: string, args: Ast[]) => {
    if (method === 'goto' && args.length === 1) {
      const url = str(args[0]);

      try {
        if (!['http:', 'https:'].includes(new URL(url).protocol)) fail('导航地址须为 HTTP(S)');
      } catch {
        fail('导航地址须为完整 HTTP(S) URL');
      }

      step.pageId = pageId(object);
      step.kind = 'navigate';
      step.action = action({
        type: 'navigate',
        target: { kind: 'css', value: '', name: '' },
        value: url,
      });
    } else if (method === 'screenshot' && args.length === 0) {
      step.pageId = pageId(object);
      step.kind = 'action';
      step.action = action({
        type: 'screenshot',
        target: { kind: 'css', value: '', name: '' },
        value: '',
      });
    } else if (method === 'waitForTimeout' && args.length === 1) {
      step.pageId = pageId(object);
      step.kind = 'wait';
      step.action = action({
        type: 'wait',
        condition: 'observe',
        value: '',
        timeoutMs: literal(args[0]),
      });
    } else if (
      ['click', 'fill', 'press'].includes(method) &&
      args.length === (method === 'click' ? 0 : 1)
    ) {
      const result = readLocator(object);

      step.pageId = result.page;
      step.action = action({
        type: method,
        target: result.target,
        value: method === 'click' ? '' : str(args[0]),
      });
    } else fail('支持 goto、click、fill、press、waitForTimeout');
  };

  let previousEnd = 0;

  for (const statement of program.body || []) {
    line = statement.loc?.start.line || 1;
    if (statement.type === 'EmptyStatement') continue;
    const expr = statement.expression;

    if (
      statement.type !== 'ExpressionStatement' ||
      expr?.type !== 'AwaitExpression' ||
      expr.argument?.type !== 'CallExpression'
    )
      fail('每个步骤须为 await 调用；不支持变量、循环或任意 JavaScript');
    const call = expr!.argument!;
    const args = call.arguments || [];
    const nodeMatch = code.slice(previousEnd, statement.start).match(/\/\/ @node ([^\r\n]+)\s*$/);

    previousEnd = statement.end;
    const step: RecordingOperation = {
      kind: 'action',
      title: '',
      pageId: 'page-1',
      ...(nodeMatch ? { planNodeId: nodeMatch[1].trim() } : {}),
    };

    if (call.callee?.type === 'Identifier') readHelper(step, call);
    else {
      const { object, method } = member(call.callee);

      if (Object.hasOwn(assertionTypes, method)) readAssertion(step, object, method, args);
      else readAction(step, object, method, args);
    }

    if (step.action?.platform === 'web') {
      const recorded = step.action.action;

      step.title =
        recorded.type === 'plugin'
          ? `plugin ${recorded.plugin.id}`
          : recorded.type === 'wait'
            ? `等待 ${recorded.condition}`
            : `${recorded.type} ${recorded.type === 'navigate' ? recorded.value : recorded.target.name || recorded.target.value}`;
    }

    steps.push(step);
    if (steps.length > 500) fail('脚本最多 500 个步骤');
  }

  if (!steps.length) fail('至少需要一个操作或预期');

  return steps;
}
