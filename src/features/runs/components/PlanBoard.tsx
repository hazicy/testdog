'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  useReactFlow,
  useStore,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Plan } from '@/automation/compiler/schema';
import type { ExecutionStep } from '@/features/runs/types';
import { layoutPlan, type PlanLayout } from '@/features/runs/lib/planLayout';
import {
  InsertStepMenu,
  type InsertFlowNode,
} from '@/features/test-cases/components/InsertStepMenu';
import { insertStep, type Insertion } from '@/features/test-cases/lib/authoring';
import {
  duplicateNode,
  moveNode,
  positionBefore,
  removeNode,
  updateNodeContent,
} from '@/features/test-cases/lib/planEditing';
import { PlanNodes, type PlanFlowNode, type NodeReview } from './PlanNodes';

const nodeTypes = { plan: PlanNodes, insert: InsertStepMenu };

type BoardNode = PlanFlowNode | InsertFlowNode;
type BoardProps = {
  plan?: Plan;
  steps: ExecutionStep[];
  onStep: (step: ExecutionStep) => void;
  onChange?: (plan: Plan) => void;
  fullHeight?: boolean;
  settings?: ReactNode;
  settingsOpen?: boolean;
  onSettingsClose?: () => void;
  floatingPanel?: ReactNode;
  viewportOverlay?: ReactNode;
  overlayExpanded?: boolean;
  review?: Record<string, NodeReview>;
};

export function PlanBoard(props: BoardProps) {
  if (!props.plan) return <p className="p-6 text-sm text-page-muted">计划生成后会在此展示。</p>;

  return (
    <ReactFlowProvider>
      <PlanBoardContent {...props} plan={props.plan} />
    </ReactFlowProvider>
  );
}

function PlanBoardContent({
  plan,
  steps,
  onStep,
  onChange,
  fullHeight,
  settings,
  settingsOpen,
  onSettingsClose,
  floatingPanel,
  viewportOverlay,
  overlayExpanded,
  review,
}: BoardProps & { plan: Plan }) {
  const [layout, setLayout] = useState<PlanLayout>();
  const [error, setError] = useState('');
  const flow = useReactFlow<BoardNode>();
  const viewportWidth = useStore((state) => state.width);
  const viewportHeight = useStore((state) => state.height);
  const hasViewportOverlay = !!viewportOverlay || !!floatingPanel;
  const viewPadding = useMemo(
    () =>
      hasViewportOverlay
        ? {
            top: `${Math.min(viewportHeight * 0.15, 110)}px` as const,
            bottom: `${Math.min(viewportHeight * 0.45, overlayExpanded ? 280 : 140)}px` as const,
            left: '32px' as const,
            right: '32px' as const,
          }
        : 0.1,
    [hasViewportOverlay, viewportHeight, overlayExpanded],
  );
  const planKey = JSON.stringify(plan);

  useEffect(() => {
    let cancelled = false;

    layoutPlan(JSON.parse(planKey) as Plan).then(
      (result) => {
        if (!cancelled) setLayout(result);
      },
      () => {
        if (!cancelled) setError('计划布局失败，请刷新重试。');
      },
    );

    return () => {
      cancelled = true;
    };
  }, [planKey]);

  function commit(operation: () => Plan) {
    try {
      onChange?.(operation());
      setError('');
    } catch {
      setError('操作会产生循环或无效引用，请调整节点后重试。');
    }
  }

  const nodes: BoardNode[] = (layout?.nodes ?? [])
    .filter((item) => !!plan.nodes[item.planNodeId])
    .map((item) => {
      const node = plan.nodes[item.planNodeId];
      const nodeSteps = steps.filter(
        (step) =>
          step.planNodeId === node.id &&
          (node.kind !== 'task' ||
            node.actionType === 'assert' ||
            (item.assertionIndex !== undefined
              ? step.kind === 'assertion' &&
                step.assertion?.description === node.assertions[item.assertionIndex]?.description
              : !node.assertions.length || step.kind !== 'assertion')),
      );

      return {
        id: item.id,
        type: 'plan',
        position: item.position,
        width: item.width,
        height: item.height,
        style: { width: item.width, height: item.height },
        data: {
          node,
          review: review?.[node.id],
          assertionIndex: item.assertionIndex,
          reference: item.reference,
          pathLabel: item.pathLabel,
          steps: nodeSteps,
          onStep,
          editable: !!onChange && !item.reference,
          mutable: node.id !== plan.rootId && !!positionBefore(plan, node.id),
          onContent: (value: string) => commit(() => updateNodeContent(plan, node.id, value)),
          onDuplicate: () => commit(() => duplicateNode(plan, node.id)),
          onRemove: () => commit(() => removeNode(plan, node.id)),
          onDrop: (id: string) => {
            const position = positionBefore(plan, node.id);

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
      position: { x: 0, y: bottom + 56 },
      width: 760,
      height: 90,
      style: { width: 760, height: 90 },
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
    for (const item of layout?.insertions ?? []) {
      nodes.push({
        id: item.id,
        type: 'insert',
        position: item.position,
        width: 36,
        height: 36,
        zIndex: 10,
        data: {
          label: `在 ${item.groupId} 的第 ${item.index + 1} 个位置添加节点`,
          onInsert: (type) => commit(() => insertStep(plan, item, type)),
          onDrop: (id: string) => commit(() => moveNode(plan, id, item as Insertion)),
        },
      });
    }

  const structureKey = nodes.map((node) => node.id).join(',');

  useEffect(() => {
    if (!structureKey) return;
    const frame = requestAnimationFrame(() => {
      void flow.fitView({ padding: viewPadding, maxZoom: 1 });
    });

    return () => cancelAnimationFrame(frame);
  }, [structureKey, flow, viewportWidth, viewPadding]);

  const edges = useMemo<Edge[]>(
    () =>
      (layout?.edges ?? []).map((edge) => ({
        ...edge,
        type: 'smoothstep',
        sourceHandle:
          edge.kind === 'dependency' || edge.kind === 'reference' ? 'node-out' : 'sequence-out',
        targetHandle:
          edge.kind === 'dependency' || edge.kind === 'reference' ? 'node-in' : 'sequence-in',
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

  return (
    <div className={`plan-board ${fullHeight ? 'plan-board-full' : ''}`}>
      {error && (
        <p role="alert" className="case-editor-error">
          {error}
        </p>
      )}
      <div
        className={`plan-board-body ${settingsOpen ? 'has-inspector' : ''} ${floatingPanel ? 'has-floating-panel' : ''}`}
      >
        <div
          className={`plan-viewport ${viewportOverlay ? 'has-composer' : ''}`}
          aria-label="计划画板"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            const movements: Record<string, [number, number]> = {
              ArrowLeft: [40, 0],
              ArrowRight: [-40, 0],
              ArrowUp: [0, 40],
              ArrowDown: [0, -40],
            };
            const movement = movements[event.key];

            if (movement) {
              event.preventDefault();
              const current = flow.getViewport();

              void flow.setViewport({
                ...current,
                x: current.x + movement[0],
                y: current.y + movement[1],
              });
            }
          }}
        >
          {layout ? (
            <ReactFlow<BoardNode>
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={false}
              nodesFocusable={false}
              edgesFocusable={false}
              deleteKeyCode={null}
              panOnScroll
              zoomOnScroll={false}
              zoomActivationKeyCode={['Meta', 'Control']}
              minZoom={0.08}
              maxZoom={1.5}
              fitView
              fitViewOptions={{ padding: viewPadding, maxZoom: 1 }}
            >
              <Background color="#edf0f3" gap={24} size={1} />
            </ReactFlow>
          ) : (
            <p role="status" className="p-6 text-sm text-page-muted">
              正在展开画板…
            </p>
          )}
          {viewportOverlay}
          {layout && (
            <div className="plan-canvas-tools">
              {onChange && (
                <p className="plan-canvas-hint">
                  {Object.values(plan.nodes).some((node) => node.kind === 'task')
                    ? '点击步骤编辑 · 点击 ＋ 添加'
                    : '点击画板上的 ＋，添加第一步'}
                </p>
              )}
              <div className="plan-viewport-controls" role="group" aria-label="画板视图">
                <button type="button" aria-label="缩小画板" onClick={() => void flow.zoomOut()}>
                  −
                </button>
                <button
                  type="button"
                  aria-label="全览画板"
                  onClick={() => void flow.fitView({ padding: viewPadding, maxZoom: 1 })}
                >
                  全览
                </button>
                <button type="button" aria-label="放大画板" onClick={() => void flow.zoomIn()}>
                  ＋
                </button>
              </div>
            </div>
          )}
        </div>
        {floatingPanel}
        {settingsOpen && (
          <aside className="plan-inspector" aria-label="画板设置">
            <div className="flex items-center justify-between gap-2 mb-5">
              <h3 className="text-sm font-semibold">测试设置</h3>
              <button
                type="button"
                className="ws-icon-button"
                aria-label="关闭设置"
                onClick={onSettingsClose}
              >
                ×
              </button>
            </div>
            {settings}
          </aside>
        )}
      </div>
    </div>
  );
}
