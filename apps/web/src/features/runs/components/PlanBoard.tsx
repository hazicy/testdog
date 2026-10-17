'use client';

import { useTranslations } from 'next-intl';

import clsx from 'clsx';

import styles from './PlanBoard.module.css';
import boardStyles from '@/features/runs/components/plan-board.module.css';

import { Button } from '@/components/ui/Button';
import { Icon } from '@iconify/react/offline';
import pointerIcon from '@iconify-icons/lucide/mouse-pointer-2';
import handIcon from '@iconify-icons/lucide/hand';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ReactFlow, ReactFlowProvider, Background, useReactFlow, useStore } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Plan } from '@testdog/contracts/automation/compiler/schema';
import type { ExecutionStep, RunArtifact } from '@testdog/contracts/runs/types';
import { InsertStepMenu } from '@/features/test-cases/components/InsertStepMenu';
import { usePlanBoard, type BoardNode } from '@/features/runs/hooks/usePlanBoard';
import { PlanNodes, type NodeReview } from '@/features/runs/components/PlanNodes';
import { usePlanHistory } from '@/features/runs/hooks/usePlanHistory';

const MIN_ZOOM = 0.08;
const MAX_ZOOM = 1.5;

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
  const t = useTranslations('runs');

  if (!props.plan) return <p className={styles.description}>{t('planEmpty')}</p>;

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
  const t = useTranslations('runs');
  const [hoveredId, setHoveredId] = useState<string>();
  const [tool, setTool] = useState<'select' | 'pan'>('select');
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
  const previousSize = useRef<{ width: number; height: number } | undefined>(undefined);

  useEffect(() => {
    if (!viewportWidth || !viewportHeight) return;
    const previous = previousSize.current;

    previousSize.current = { width: viewportWidth, height: viewportHeight };
    if (!previous) return;
    const viewport = flow.getViewport();

    // Keep the same canvas point centered when the settings pane changes the available space.
    void flow.setViewport({
      ...viewport,
      x: viewport.x + (viewportWidth - previous.width) / 2,
      y: viewport.y + (viewportHeight - previous.height) / 2,
    });
  }, [flow, viewportWidth, viewportHeight]);
  const hasViewportOverlay = !!viewportOverlay || !!floatingPanel;
  // React Flow fitView padding accepts pixel strings or percentages, not CSS lengths.
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
    <div
      data-ui="plan-board"
      className={clsx(boardStyles.planBoard, { [boardStyles.planBoardFull]: fullHeight })}
    >
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <div
        className={clsx(
          boardStyles.planBoardBody,
          { [boardStyles.hasInspector]: settingsOpen },
          { [boardStyles.hasFloatingPanel]: floatingPanel },
        )}
      >
        <div
          data-ui="plan-viewport"
          className={boardStyles.planViewport}
          aria-label={t('plan')}
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
            selectionOnDrag={tool === 'select'}
            autoPanOnSelection={false}
            selectionKeyCode={null}
            panOnDrag={tool === 'pan' ? [0, 1] : [1]}
            panActivationKeyCode="Space"
            nodesFocusable
            edgesFocusable={false}
            deleteKeyCode={null}
            panOnScroll
            zoomOnScroll={false}
            zoomActivationKeyCode={['Meta', 'Control']}
            minZoom={MIN_ZOOM}
            maxZoom={MAX_ZOOM}
            fitView
            fitViewOptions={{ padding: viewPadding, maxZoom: 1 }}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#edf0f3" gap={24} size={1} />
          </ReactFlow>
          {viewportOverlay}
          <div className={boardStyles.planCanvasTools}>
            <div
              data-ui="plan-viewport-controls"
              className={boardStyles.planViewportControls}
              role="group"
              aria-label={t('canvasView')}
            >
              <button
                type="button"
                aria-label={t('selectCanvas')}
                title={t('selectCanvas')}
                aria-pressed={tool === 'select'}
                onClick={() => setTool('select')}
              >
                <Icon icon={pointerIcon} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label={t('panCanvas')}
                title={t('panCanvas')}
                aria-pressed={tool === 'pan'}
                onClick={() => setTool('pan')}
              >
                <Icon icon={handIcon} aria-hidden="true" />
              </button>
              <span className={boardStyles.planToolDivider} aria-hidden="true" />
              {onChange && (
                <>
                  <button
                    type="button"
                    aria-label={t('undoCanvas')}
                    title={t('undoShortcut')}
                    disabled={!history.canUndo}
                    onClick={history.undo}
                  >
                    ↶
                  </button>
                  <button
                    type="button"
                    aria-label={t('redoCanvas')}
                    title={t('redoShortcut')}
                    disabled={!history.canRedo}
                    onClick={history.redo}
                  >
                    ↷
                  </button>
                </>
              )}
              <button
                type="button"
                aria-label={t('zoomOut')}
                title={t('zoomOut')}
                disabled={zoom <= MIN_ZOOM}
                onClick={() => void flow.zoomOut()}
              >
                −
              </button>
              <button
                type="button"
                aria-label={t('resetZoom')}
                title={t('reset100')}
                onClick={() => void flow.zoomTo(1)}
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                type="button"
                aria-label={t('fitCanvas')}
                onClick={() => void flow.fitView({ padding: viewPadding, maxZoom: 1 })}
              >
                {t('fit')}
              </button>
              <button
                type="button"
                aria-label={t('zoomIn')}
                title={t('zoomIn')}
                disabled={zoom >= MAX_ZOOM}
                onClick={() => void flow.zoomIn()}
              >
                ＋
              </button>
            </div>
          </div>
        </div>
        {floatingPanel}
        {settingsOpen && (
          <aside
            id="case-panel-settings"
            className={boardStyles.planInspector}
            aria-label={t('testSettings')}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && !event.defaultPrevented) {
                event.stopPropagation();
                onSettingsClose?.();
              }
            }}
          >
            <div className={styles.container}>
              <h3 className={styles.subheading}>{t('testSettings')}</h3>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t('closeSettings')}
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
