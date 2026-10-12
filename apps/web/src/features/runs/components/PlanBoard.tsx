'use client';

import { Button } from '@/components/ui/Button';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ReactFlow, ReactFlowProvider, Background, useReactFlow, useStore } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import '@/features/runs/components/plan-board.css';
import type { Plan } from '@testdog/contracts/automation/compiler/schema';
import type { ExecutionStep, RunArtifact } from '@testdog/contracts/runs/types';
import { InsertStepMenu } from '@/features/test-cases/components/InsertStepMenu';
import { usePlanBoard, type BoardNode } from '@/features/runs/hooks/usePlanBoard';
import { PlanNodes, type NodeReview } from '@/features/runs/components/PlanNodes';
import { usePlanHistory } from '@/features/runs/hooks/usePlanHistory';

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
  artifacts?: RunArtifact[];
  results?: boolean;
  currentStepId?: string;
  onFrame?: (frame: RunArtifact) => void;
  onIssue?: (step: ExecutionStep) => void;
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
  artifacts,
  results,
  currentStepId,
  onFrame,
  onIssue,
}: BoardProps & { plan: Plan }) {
  const [hoveredId, setHoveredId] = useState<string>();
  const history = usePlanHistory(plan, onChange);
  const { nodes, edges, error, onNodesChange } = usePlanBoard({
    plan,
    steps,
    onStep,
    onChange: history.change,
    hoveredId,
    review,
    artifacts,
    results,
    currentStepId,
    onFrame,
    onIssue,
  });
  const flow = useReactFlow<BoardNode>();
  const viewportWidth = useStore((state) => state.width);
  const viewportHeight = useStore((state) => state.height);
  const zoom = useStore((state) => state.transform[2]);
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
  const fittedStructure = useRef<string | undefined>(undefined);
  const structureKey = nodes.map((node) => node.id).join(',');

  useEffect(() => {
    if (
      !structureKey ||
      !viewportWidth ||
      !viewportHeight ||
      fittedStructure.current === structureKey
    )
      return;
    const frame = requestAnimationFrame(() => {
      const viewport = flow.getViewport();
      const bottomPadding = hasViewportOverlay ? (overlayExpanded ? 280 : 140) : 32;
      const fits = nodes.every(
        (node) =>
          node.position.x * viewport.zoom + viewport.x >= 16 &&
          node.position.y * viewport.zoom + viewport.y >= 16 &&
          (node.position.x + (node.width ?? 36)) * viewport.zoom + viewport.x <=
            viewportWidth - 16 &&
          (node.position.y + (node.height ?? 36)) * viewport.zoom + viewport.y <=
            viewportHeight - bottomPadding,
      );

      // Preserve the user's view when possible; reveal newly added columns/rows.
      if (!fittedStructure.current || !fits)
        void flow.fitView({ padding: viewPadding, maxZoom: 1 });
      fittedStructure.current = structureKey;
    });

    return () => cancelAnimationFrame(frame);
  }, [
    structureKey,
    nodes,
    flow,
    viewportWidth,
    viewportHeight,
    viewPadding,
    hasViewportOverlay,
    overlayExpanded,
  ]);

  return (
    <div className={`plan-board ${fullHeight ? 'plan-board-full' : ''}`}>
      {error && (
        <p
          role="alert"
          className="shrink-0 border-t border-page-line px-6 py-2.5 text-[13px] text-error-ink"
        >
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
          onMouseLeave={() => setHoveredId(undefined)}
          onMouseMove={(event) => {
            if (hoveredId && !(event.target as Element).closest('.react-flow__node'))
              setHoveredId(undefined);
          }}
          onKeyDown={(event) => {
            if (
              event.target instanceof HTMLElement &&
              event.target.closest('input, textarea, select, [contenteditable="true"]')
            )
              return;
            if (onChange && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
              event.preventDefault();
              if (event.shiftKey) history.redo();
              else history.undo();

              return;
            }

            if (event.target !== event.currentTarget) return;
            if (event.key === '+' || event.key === '=') {
              event.preventDefault();
              void flow.zoomIn();
            } else if (event.key === '-') {
              event.preventDefault();
              void flow.zoomOut();
            } else if (event.key === '0') {
              event.preventDefault();
              void flow.fitView({ padding: viewPadding, maxZoom: 1 });
            }

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
            onNodeMouseEnter={(_, node) => setHoveredId(node.id)}
            onNodeMouseLeave={() => setHoveredId(undefined)}
            edges={edges}
            nodeTypes={nodeTypes}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
            selectionOnDrag
            autoPanOnSelection={false}
            selectionKeyCode={null}
            panOnDrag={[1]}
            panActivationKeyCode="Space"
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
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#edf0f3" gap={24} size={1} />
          </ReactFlow>
          {viewportOverlay}
          <div className="plan-canvas-tools">
            <div className="plan-viewport-controls" role="group" aria-label="画板视图">
              {onChange && (
                <>
                  <button
                    type="button"
                    aria-label="撤销画板操作"
                    title="撤销（Ctrl / ⌘ Z）"
                    disabled={!history.canUndo}
                    onClick={history.undo}
                  >
                    ↶
                  </button>
                  <button
                    type="button"
                    aria-label="重做画板操作"
                    title="重做（Ctrl / ⌘ Shift Z）"
                    disabled={!history.canRedo}
                    onClick={history.redo}
                  >
                    ↷
                  </button>
                </>
              )}
              <button type="button" aria-label="缩小画板" onClick={() => void flow.zoomOut()}>
                −
              </button>
              <button
                type="button"
                aria-label="画板恢复原始比例"
                title="恢复 100%"
                onClick={() => void flow.zoomTo(1)}
              >
                {Math.round(zoom * 100)}%
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
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="关闭设置"
                onClick={onSettingsClose}
              >
                ×
              </Button>
            </div>
            {settings}
          </aside>
        )}
      </div>
    </div>
  );
}
