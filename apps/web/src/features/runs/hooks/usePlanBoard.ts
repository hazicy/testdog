'use client';

import { useCallback, useMemo, useState } from 'react';
import type { Edge, NodeChange } from '@xyflow/react';
import type { Plan } from '@testdog/contracts/automation/compiler/schema';
import type { ExecutionStep, RunArtifact } from '@testdog/contracts/runs/types';
import { boardNodeSteps, boardResult, indexStepsByNode } from '@/features/runs/lib/boardResults';
import { layoutPlan, PLAN_ROW_WIDTH } from '@/features/runs/lib/planLayout';
import type { InsertFlowNode } from '@/features/test-cases/components/InsertStepMenu';
import { insertStep, type Insertion } from '@/features/test-cases/lib/authoring';
import {
  duplicateNode,
  moveNode,
  removeNode,
  updateNodeContent,
} from '@/features/test-cases/lib/planEditing';
import type { PlanFlowNode, NodeReview } from '@/features/runs/components/PlanNodes';

export type BoardNode = PlanFlowNode | InsertFlowNode;

type Options = {
  plan: Plan;
  steps: ExecutionStep[];
  onStep: (step: ExecutionStep) => void;
  onChange?: (plan: Plan) => void;
  review?: Record<string, NodeReview>;
  artifacts?: RunArtifact[];
  results?: boolean;
  currentStepId?: string;
  onFrame?: (frame: RunArtifact) => void;
  onIssue?: (step: ExecutionStep) => void;
  hoveredId?: string;
};

export function usePlanBoard({
  plan,
  steps,
  onStep,
  onChange,
  review,
  artifacts = [],
  results = false,
  currentStepId,
  onFrame,
  onIssue,
  hoveredId,
}: Options) {
  const [error, setError] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const onNodesChange = useCallback((changes: NodeChange<BoardNode>[]) => {
    const selections = changes.filter((change) => change.type === 'select');

    if (!selections.length) return;
    setSelectedIds((previous) => {
      const next = new Set(previous);

      for (const change of selections) {
        if (change.selected) next.add(change.id);
        else next.delete(change.id);
      }

      return next;
    });
  }, []);
  const layout = useMemo(() => layoutPlan(plan, results), [plan, results]);
  const stepsByNode = useMemo(() => indexStepsByNode(steps), [steps]);

  const positions = useMemo(() => {
    const index = new Map<string, Insertion>();

    for (const node of Object.values(plan.nodes)) {
      if (node.kind !== 'group') continue;
      node.children.forEach((id, position) => {
        if (!index.has(id)) index.set(id, { groupId: node.id, index: position });
      });
    }

    return index;
  }, [plan]);

  function commit(operation: () => Plan) {
    try {
      onChange?.(operation());
      setError('');
    } catch {
      setError('操作会产生循环或无效引用，请调整节点后重试。');
    }
  }

  const nodeResults = useMemo(() => {
    const entries = new Map<
      string,
      { steps: ExecutionStep[]; result: ReturnType<typeof boardResult> }
    >();

    for (const item of layout.nodes) {
      const node = plan.nodes[item.planNodeId];
      const nodeSteps = boardNodeSteps(node, stepsByNode.get(node.id) ?? [], item.assertionIndex);

      entries.set(item.id, { steps: nodeSteps, result: boardResult(nodeSteps, artifacts) });
    }

    return entries;
  }, [layout, plan, stepsByNode, artifacts]);

  const nodes: BoardNode[] = layout.nodes.map((item) => {
    const node = plan.nodes[item.planNodeId];
    const { steps: nodeSteps, result } = nodeResults.get(item.id)!;

    return {
      id: item.id,
      type: 'plan',
      selected: selectedIds.has(item.id),
      position: item.position,
      width: item.width,
      height: item.height,
      style: { width: item.width, height: item.height },
      data: {
        node,
        result: results && node.kind !== 'group' && !item.reference ? result : undefined,
        current: nodeSteps.some((step) => step.id === currentStepId),
        currentStepId,
        onFrame,
        onIssue,
        review: review?.[node.id],
        assertionIndex: item.assertionIndex,
        reference: item.reference,
        pathLabel: item.pathLabel,
        steps: nodeSteps,
        onStep,
        editable: !!onChange && !item.reference,
        mutable:
          item.assertionIndex === undefined && node.id !== plan.rootId && positions.has(node.id),
        onContent: (value: string) =>
          commit(() => updateNodeContent(plan, node.id, value, item.assertionIndex)),
        onDuplicate: () => commit(() => duplicateNode(plan, node.id)),
        onRemove: () => commit(() => removeNode(plan, node.id)),
        onDrop: (id: string) => {
          const position = positions.get(node.id);

          if (position && id !== node.id) commit(() => moveNode(plan, id, position));
        },
      },
    };
  });

  for (const [id, change] of Object.entries(review ?? {})) {
    if (
      change.kind !== 'removed' ||
      !change.before ||
      nodes.some((node) => 'node' in node.data && node.data.node.id === id)
    )
      continue;
    const bottom = Math.max(0, ...nodes.map((node) => node.position.y + (node.height ?? 80)));

    nodes.push({
      id: `review-removed-${id}`,
      type: 'plan',
      selected: selectedIds.has(`review-removed-${id}`),
      position: { x: 0, y: bottom + 56 },
      width: PLAN_ROW_WIDTH,
      height: 90,
      style: { width: PLAN_ROW_WIDTH, height: 90 },
      data: {
        node: change.before,
        review: change,
        reference: false,
        steps: [],
        editable: false,
        mutable: false,
        onContent: () => {},
        onDuplicate: () => {},
        onRemove: () => {},
        onDrop: () => {},
        onStep,
      },
    });
  }

  if (onChange)
    for (const item of layout.insertions) {
      const group = plan.nodes[item.groupId];

      if (group.kind !== 'group') continue;
      const positions = [
        { index: 0, label: '分组开头' },
        ...group.children.map((id, index) => {
          const child = plan.nodes[id];
          const title = child.kind === 'branch' ? child.condition : child.goal;

          return { index: index + 1, label: `在「${title}」后` };
        }),
      ];

      nodes.push({
        id: item.id,
        type: 'insert',
        selectable: false,
        focusable: false,
        position: item.position,
        width: 36,
        height: 36,
        zIndex: 10,
        data: {
          persistent: item.index === group.children.length,
          revealed: !!item.anchorId && item.anchorId === hoveredId,
          label: `在 ${item.groupId} 的第 ${item.index + 1} 个位置添加节点`,
          index: item.index,
          positions,
          description: `添加到「${group.goal}」· ${positions[item.index].label}`,
          onInsert: (type, index) =>
            commit(() => insertStep(plan, { groupId: item.groupId, index }, type)),
          onDrop: (id: string) => commit(() => moveNode(plan, id, item)),
        },
      });
    }

  const edges = useMemo<Edge[]>(
    () =>
      layout.edges.map((edge) => ({
        ...edge,
        selectable: false,
        type: 'smoothstep',
        sourceHandle: edge.kind === 'reference' ? 'node-out' : 'sequence-out',
        targetHandle: edge.kind === 'reference' ? 'node-in' : 'sequence-in',
        style: {
          stroke: edge.kind === 'sequence' ? '#e5e7eb' : 'var(--plan-edge)',
          strokeWidth: 1.2,
          strokeDasharray:
            edge.kind === 'dependency' || edge.kind === 'reference' ? '5 4' : undefined,
        },
        labelStyle: { fill: 'var(--page-muted)', fontSize: 11 },
        labelBgStyle: { fill: 'var(--surface)' },
        ariaLabel:
          edge.kind === 'dependency'
            ? `依赖：${edge.source.slice(5)} → ${edge.target.slice(5)}`
            : edge.label,
      })),
    [layout],
  );

  return { nodes, edges, error, onNodesChange };
}
