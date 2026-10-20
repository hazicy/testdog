import { createId } from '@/client/id';
import { PlanSchema, type Plan } from '@testdog/contracts/execution/plan';
import { parseFeishuClipboard } from '@/features/runs/lib/feishuClipboard';

const stepPrefix = /^(?:步骤|操作步骤|step)\s*[:：]\s*/i;
const expectedPrefix = /^(?:预期(?:结果)?|expected(?: result)?)\s*[:：]\s*/i;

// Return null for ordinary clipboard content so native text paste still works.
export function pasteFeishuPlan(plan: Plan, html: string) {
  const payload = parseFeishuClipboard(html);

  if (!payload) return null;
  if (payload.data.some((node) => node.type !== 24 || !node.info.mindMap))
    throw new Error('Unsupported Feishu diagram type');
  const byId = new Map(payload.data.map((node) => [node.id, node]));
  const children = new Map<string, string[]>();
  const roots: string[] = [];

  for (const node of payload.data) {
    const parentId = node.info.mindMap!.parentId;

    if (byId.has(parentId)) {
      const siblings = children.get(parentId) ?? [];

      siblings.push(node.id);
      children.set(parentId, siblings);
    } else roots.push(node.id);
  }

  const nodes = { ...plan.nodes };
  const freshId = () => {
    let id = createId();

    while (Object.hasOwn(nodes, id)) id = createId();

    return id;
  };

  const addTask = (goal: string, assertions: string[] = [], assert = false) => {
    const id = freshId();

    nodes[id] = {
      id,
      kind: 'task',
      actionType: assert ? 'assert' : 'act',
      goal,
      dependsOn: [],
      requirementIds: [],
      assertions: (assert ? [goal] : assertions).map((description) => ({ description })),
    };

    return id;
  };

  const addGroup = (goal: string, children: string[]) => {
    const id = freshId();

    nodes[id] = { id, kind: 'group', goal, children, dependsOn: [] };

    return id;
  };

  const textOf = (id: string) => byId.get(id)!.info.textV2?.text.trim() ?? '';
  const convert = (id: string): string[] => {
    const text = textOf(id);
    const descendants = children.get(id) ?? [];

    // Image-only mind-map nodes have no executable text. Keep any textual descendants.
    if (!text) return descendants.flatMap(convert);
    if (expectedPrefix.test(text)) {
      const description = text.replace(expectedPrefix, '').trim();

      if (!description) throw new Error('Empty expected result');

      return [addTask(description, [], true), ...descendants.flatMap(convert)];
    }

    const lines = text.split(/\r?\n/);
    const expectedLine = lines.findIndex((line) => expectedPrefix.test(line.trim()));
    const goal = (expectedLine < 0 ? text : lines.slice(0, expectedLine).join('\n'))
      .replace(stepPrefix, '')
      .trim();

    if (!goal) throw new Error('Empty Feishu step');
    const assertions: string[] = [];

    if (expectedLine >= 0) {
      for (const line of lines.slice(expectedLine)) {
        if (expectedPrefix.test(line.trim()))
          assertions.push(line.trim().replace(expectedPrefix, ''));
        else if (assertions.length) assertions[assertions.length - 1] += `\n${line}`;
      }
    }

    const rest: string[] = [];

    for (const child of descendants) {
      const childText = textOf(child);

      if (expectedPrefix.test(childText) && !children.get(child)?.length)
        assertions.push(childText.replace(expectedPrefix, ''));
      else rest.push(child);
    }

    if (assertions.some((value) => !value.trim())) throw new Error('Empty expected result');
    // A labelled step remains executable even when it also has nested steps.
    if (stepPrefix.test(text) || assertions.length || !descendants.length) {
      const task = addTask(
        goal,
        assertions.map((value) => value.trim()),
      );
      const following = rest.flatMap(convert);

      return following.length ? [addGroup(goal, [task, ...following])] : [task];
    }

    const converted = rest.flatMap(convert);

    return converted.length ? [addGroup(goal, converted)] : [addTask(goal)];
  };

  const imported = roots.flatMap(convert);

  if (!imported.length) throw new Error('No executable Feishu content');
  const root = plan.nodes[plan.rootId];
  let rootId = plan.rootId;

  if (root.kind === 'group')
    nodes[root.id] = { ...root, children: [...root.children, ...imported] };
  else
    rootId = addGroup(root.kind === 'branch' ? root.condition : root.goal, [root.id, ...imported]);

  return {
    plan: PlanSchema.parse({ rootId, nodes }),
    skippedImages: payload.resource?.filter((resource) => resource.type === 1).length ?? 0,
  };
}
