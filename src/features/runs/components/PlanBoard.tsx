'use client';

import { useEffect, useMemo, type ReactNode } from 'react';
import { ReactFlow, ReactFlowProvider, Background, useReactFlow, useStore } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Plan } from '@/automation/compiler/schema';
import type { ExecutionStep } from '@/features/runs/types';
import { InsertStepMenu } from '@/features/test-cases/components/InsertStepMenu';
import { usePlanBoard, type BoardNode } from '../hooks/usePlanBoard';
import { PlanNodes, type NodeReview } from './PlanNodes';

const nodeTypes = { plan: PlanNodes, insert: InsertStepMenu };

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
  const { nodes, edges, error, onNodesChange } = usePlanBoard({
    plan,
    steps,
    onStep,
    onChange,
    review,
  });
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
  const structureKey = nodes.map((node) => node.id).join(',');

  useEffect(() => {
    if (!structureKey) return;
    const frame = requestAnimationFrame(() => {
      void flow.fitView({ padding: viewPadding, maxZoom: 1 });
    });

    return () => cancelAnimationFrame(frame);
  }, [structureKey, flow, viewportWidth, viewPadding]);

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
          <ReactFlow<BoardNode>
            nodes={nodes}
            onNodesChange={onNodesChange}
            edges={edges}
            nodeTypes={nodeTypes}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
            selectionOnDrag
            autoPanOnSelection={false}
            selectionKeyCode={null}
            panOnDrag={[1]}
            panActivationKeyCode={null}
            nodesFocusable
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
          {viewportOverlay}
          <div className="plan-canvas-tools">
            {onChange && (
              <p className="plan-canvas-hint">
                {Object.values(plan.nodes).some((node) => node.kind === 'task')
                  ? '左键选择 / 框选 · 中键拖动画布 · 点击 ＋ 添加'
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
