import { PlanSchema, type Plan, type PlanNode, type StepType } from '@/automation/compiler/schema';

export type Insertion = { groupId: string; index: number };

export function emptyPlan(title: string): Plan {
  return {
    rootId: 'root',
    nodes: {
      root: { id: 'root', kind: 'group', goal: title || '测试用例', children: [], dependsOn: [] },
    },
  };
}

const task = (
  id: string,
  actionType: StepType,
  goal: string,
): Extract<PlanNode, { kind: 'task' }> => ({
  id,
  kind: 'task',
  actionType,
  goal,
  dependsOn: [],
  requirementIds: [],
  assertions: actionType === 'assert' ? [{ description: goal }] : [],
});

// Keep the original task ID as a sequence boundary so dependencies still wait for
// its assertions. The canvas displays actions and assertions as separate cards.
export function editablePlan(source: Plan, title?: string): Plan {
  const plan = structuredClone(source);
  const freshId = (base: string) => {
    let id = base;

    while (Object.hasOwn(plan.nodes, id)) id += '-';

    return id;
  };

  for (const node of Object.values(source.nodes)) {
    if (node.kind !== 'task' || !node.assertions.length || node.actionType === 'assert') continue;
    const actionId = freshId(`${node.id}:act`);

    plan.nodes[actionId] = {
      ...node,
      id: actionId,
      actionType: node.actionType ?? 'act',
      dependsOn: [],
      assertions: [],
    };
    const children = [actionId];

    for (const [index, assertion] of node.assertions.entries()) {
      const id = freshId(`${node.id}:assert:${index + 1}`);

      plan.nodes[id] = task(id, 'assert', assertion.description);
      children.push(id);
    }

    plan.nodes[node.id] = {
      id: node.id,
      kind: 'group',
      presentation: 'sequence',
      goal: node.goal,
      dependsOn: node.dependsOn,
      children,
    };
  }

  if (
    plan.nodes[plan.rootId].kind !== 'group' ||
    (plan.nodes[plan.rootId] as Extract<PlanNode, { kind: 'group' }>).presentation
  ) {
    const id = freshId('case-root');

    plan.nodes[id] = {
      id,
      kind: 'group',
      goal: title || '测试用例',
      children: [plan.rootId],
      dependsOn: [],
    };
    plan.rootId = id;
  }

  const root = plan.nodes[plan.rootId];

  if (title && root.kind === 'group') plan.nodes[root.id] = { ...root, goal: title };

  // Branch paths are sequences too, so each path can receive steps from the canvas.
  for (const node of Object.values(plan.nodes)) {
    if (node.kind !== 'branch') continue;
    for (const field of ['then', 'otherwise'] as const) {
      const target = node[field];

      if (!target || plan.nodes[target].kind === 'group') continue;
      const id = freshId(`${node.id}:${field}`);

      plan.nodes[id] = {
        id,
        kind: 'group',
        presentation: 'sequence',
        goal: field === 'then' ? '条件成立' : '条件不成立',
        children: [target],
        dependsOn: [],
      };
      node[field] = id;
    }
  }

  return PlanSchema.parse(plan);
}

export function insertStep(
  plan: Plan,
  insertion: Insertion,
  type: StepType | 'group' | 'branch',
  id = crypto.randomUUID(),
): Plan {
  const group = plan.nodes[insertion.groupId];

  if (group?.kind !== 'group') throw new Error('请选择有效的插入位置');
  const nodes = { ...plan.nodes };
  const labels = {
    act: '填写操作步骤',
    assert: '填写预期结果',
    login: '填写登录步骤与输入引用',
    files: '填写文件操作',
    screenshot: '截取当前页面',
  };

  if (type === 'group')
    nodes[id] = { id, kind: 'group', goal: '新分组', children: [], dependsOn: [] };
  else if (type === 'branch') {
    const then = `${id}:then`,
      otherwise = `${id}:otherwise`;

    nodes[id] = { id, kind: 'branch', condition: '填写分支条件', then, otherwise, dependsOn: [] };
    nodes[then] = {
      id: then,
      kind: 'group',
      presentation: 'sequence',
      goal: '条件成立',
      children: [],
      dependsOn: [],
    };
    nodes[otherwise] = {
      id: otherwise,
      kind: 'group',
      presentation: 'sequence',
      goal: '条件不成立',
      children: [],
      dependsOn: [],
    };
  } else nodes[id] = task(id, type, labels[type]);
  const children = [...group.children];

  children.splice(insertion.index, 0, id);
  nodes[group.id] = { ...group, children };

  return PlanSchema.parse({ ...plan, nodes });
}

export function planText(plan: Plan): string {
  const lines: string[] = [];
  const seen = new Set<string>();

  function visit(id: string, depth: number) {
    if (seen.has(id)) return;
    seen.add(id);
    const node = plan.nodes[id];
    const prefix = '  '.repeat(depth);

    if (node.kind === 'group') {
      if (!node.presentation) lines.push(`${prefix}${node.goal}`);
      node.children.forEach((child) => visit(child, depth + (node.presentation ? 0 : 1)));
    } else if (node.kind === 'branch') {
      lines.push(`${prefix}如果：${node.condition}`);
      visit(node.then, depth + 1);
      if (node.otherwise) {
        lines.push(`${prefix}否则：`);
        visit(node.otherwise, depth + 1);
      }
    } else {
      lines.push(`${prefix}${node.actionType ?? 'act'}: ${node.goal}`);
      if (node.actionType !== 'assert')
        node.assertions.forEach((assertion) =>
          lines.push(`${prefix}assert: ${assertion.description}`),
        );
    }
  }

  visit(plan.rootId, 0);

  return lines.join('\n');
}

export function caseName(text: string): string {
  const first = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)
    ?.replace(/^(?:\d+[.、)]|[-*#])\s*/, '');

  if (first) return first.slice(0, 80);

  return `新测试 ${new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })}`;
}

export function goalUrl(text: string): string | undefined {
  const match = /https?:\/\/[^\s<>"'，。；）]+/.exec(text);

  if (!match) return;
  try {
    return new URL(match[0]).href;
  } catch {
    return;
  }
}
