import { createId } from '@/client/id';
import { executionPlugins } from '@testdog/contracts/plugins/execution';
import zh from '../../../../messages/zh.json';

export type AuthoringLabels = typeof zh.authoring;
export const defaultAuthoringLabels: AuthoringLabels = zh.authoring;

import {
  PlanSchema,
  type Plan,
  type PlanNode,
  type StepType,
} from '@testdog/contracts/execution/plan';

export type Insertion = { groupId: string; index: number };

export function emptyPlan(title: string, labels = defaultAuthoringLabels): Plan {
  return {
    rootId: 'root',
    nodes: {
      root: {
        id: 'root',
        kind: 'group',
        goal: title || labels.testCase,
        children: [],
        dependsOn: [],
      },
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
export function editablePlan(source: Plan, title?: string, labels = defaultAuthoringLabels): Plan {
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

  const originalRoot = plan.nodes[plan.rootId];

  if (originalRoot.kind !== 'group' || originalRoot.presentation) {
    const id = freshId('case-root');

    plan.nodes[id] = {
      id,
      kind: 'group',
      goal: title || labels.testCase,
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
        goal: field === 'then' ? labels.trueBranch : labels.falseBranch,
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
  id = createId(),
  labels = defaultAuthoringLabels,
): Plan {
  const group = plan.nodes[insertion.groupId];

  if (
    group?.kind !== 'group' ||
    !Number.isInteger(insertion.index) ||
    insertion.index < 0 ||
    insertion.index > group.children.length
  )
    throw new Error(labels.invalidInsertion);
  const createdIds = type === 'branch' ? [id, `${id}:then`, `${id}:otherwise`] : [id];

  if (createdIds.some((ref) => Object.hasOwn(plan.nodes, ref))) throw new Error(labels.duplicateId);
  const nodes = { ...plan.nodes };
  const stepLabels = {
    navigate: 'https://',
    act: labels.act,
    assert: labels.assert,
    login: labels.login,
    files: labels.files,
    screenshot: labels.screenshot,
    plugin: labels.plugin,
  };

  if (type === 'group')
    nodes[id] = { id, kind: 'group', goal: labels.group, children: [], dependsOn: [] };
  else if (type === 'branch') {
    const then = `${id}:then`,
      otherwise = `${id}:otherwise`;

    nodes[id] = { id, kind: 'branch', condition: labels.branch, then, otherwise, dependsOn: [] };
    nodes[then] = {
      id: then,
      kind: 'group',
      presentation: 'sequence',
      goal: labels.trueBranch,
      children: [],
      dependsOn: [],
    };
    nodes[otherwise] = {
      id: otherwise,
      kind: 'group',
      presentation: 'sequence',
      goal: labels.falseBranch,
      children: [],
      dependsOn: [],
    };
  } else {
    nodes[id] = task(id, type, stepLabels[type]);
    if (type === 'plugin')
      nodes[id].plugin = {
        id: executionPlugins[0].id,
        config: structuredClone(executionPlugins[0].defaultConfig),
      };
  }

  const children = [...group.children];

  children.splice(insertion.index, 0, id);
  nodes[group.id] = { ...group, children };

  return PlanSchema.parse({ ...plan, nodes });
}

export function planText(plan: Plan, labels = defaultAuthoringLabels): string {
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
      lines.push(`${prefix}${labels.ifPrefix}${node.condition}`);
      visit(node.then, depth + 1);
      if (node.otherwise) {
        lines.push(`${prefix}${labels.elsePrefix}`);
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

export function caseName(text: string, locale = 'zh', labels = defaultAuthoringLabels): string {
  const first = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)
    ?.replace(/^(?:\d+[.、)]|[-*#])\s*/, '');

  if (first) return first.slice(0, 80);

  return `${labels.newTest} ${new Date().toLocaleString(locale, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })}`;
}
