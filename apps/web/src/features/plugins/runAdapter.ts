import type { TestRun } from '@testdog/contracts/runs/types';
import type { PluginNode } from './api';

export function runPluginNodes(run: TestRun): PluginNode[] {
  const nodes: PluginNode[] = Object.values(run.plan?.nodes ?? {}).map((node) => {
    const steps = run.steps.filter((step) => step.planNodeId === node.id);
    const stepIds = new Set(steps.map((step) => step.id));

    return {
      id: node.id,
      type: node.kind === 'task' ? (node.actionType ?? node.kind) : node.kind,
      title: node.kind === 'branch' ? node.condition : node.goal,
      input: { ...node },
      output: { steps },
      assets: run.artifacts.filter((asset) => asset.stepId && stepIds.has(asset.stepId)),
    };
  });

  // Recording-only runs may have no plan; preserve their execution nodes too.
  for (const step of run.steps) {
    if (step.planNodeId && nodes.some((node) => node.id === step.planNodeId)) continue;
    nodes.push({
      id: step.id,
      type: step.action?.action.type ?? step.kind,
      title: step.title,
      input: { action: step.action, assertion: step.assertion, pageUrl: step.pageUrl },
      output: { steps: [step] },
      assets: run.artifacts.filter((asset) => asset.stepId === step.id),
    });
  }

  return nodes;
}
