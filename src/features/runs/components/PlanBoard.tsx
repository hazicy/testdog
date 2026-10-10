'use client';

import { Button } from '@/components/ui/Button';
import { useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  MarkerType,
  useReactFlow,
  useViewport,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Plan } from '@/automation/compiler/schema';
import type { ExecutionStep } from '@/features/runs/types';
import { layoutPlan, type PlanLayout } from '@/features/runs/lib/planLayout';
import { PlanNodes, type PlanFlowNode } from './PlanNodes';

const nodeTypes = { plan: PlanNodes };

type BoardProps = { plan?: Plan; steps: ExecutionStep[]; onStep: (step: ExecutionStep) => void };

export function PlanBoard(props: BoardProps) {
  if (!props.plan)
    return (
      <p className="p-6 text-sm text-page-muted">
        {props.steps.length ? '此记录没有保存编译计划。' : '计划生成后会在此展示。'}
      </p>
    );
  const planKey = JSON.stringify(props.plan);

  return (
    <ReactFlowProvider key={planKey}>
      <PlanBoardContent {...props} plan={props.plan} planKey={planKey} />
    </ReactFlowProvider>
  );
}

function PlanBoardContent({
  plan,
  planKey,
  steps,
  onStep,
}: BoardProps & { plan: Plan; planKey: string }) {
  const [layout, setLayout] = useState<PlanLayout>();
  const [layoutError, setLayoutError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<string>();
  const [showEdges, setShowEdges] = useState(true);
  const flow = useReactFlow<PlanFlowNode>();
  const view = useViewport();
  const stepsByNode = useMemo(() => {
    const index = new Map<string, ExecutionStep[]>();

    for (const step of steps) {
      if (!step.planNodeId) continue;
      const recorded = index.get(step.planNodeId);

      if (recorded) recorded.push(step);
      else index.set(step.planNodeId, [step]);
    }

    return index;
  }, [steps]);
  const node = plan.nodes[selected || ''];
  const selectedSteps = selected ? stepsByNode.get(selected) || [] : [];

  useEffect(() => {
    let cancelled = false;

    layoutPlan(JSON.parse(planKey) as Plan).then(
      (result) => {
        if (!cancelled) setLayout(result);
      },
      () => {
        if (!cancelled) setLayoutError(true);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [planKey, attempt]);

  const nodes = useMemo<PlanFlowNode[]>(
    () =>
      (layout?.nodes ?? []).map((item) => ({
        id: item.id,
        parentId: item.parentId,
        extent: item.parentId ? 'parent' : undefined,
        type: 'plan',
        position: item.position,
        width: item.width,
        height: item.height,
        style: { width: item.width, height: item.height },
        data: {
          node: plan.nodes[item.planNodeId],
          reference: item.reference,
          pathLabel: item.pathLabel,
          steps: stepsByNode.get(item.planNodeId) ?? [],
          active: selected === item.planNodeId,
          onSelect: setSelected,
        },
      })),
    [layout, plan, stepsByNode, selected],
  );
  const edges = useMemo<Edge[]>(
    () =>
      (layout?.edges ?? []).map((edge) => ({
        ...edge,
        type: 'smoothstep',
        hidden: edge.kind === 'dependency' && !showEdges,
        zIndex: 1,
        markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--plan-edge)' },
        style: {
          stroke: 'var(--plan-edge)',
          strokeWidth: 1.5,
          strokeDasharray: edge.kind === 'branch' ? undefined : '5 4',
        },
        labelStyle: { fill: 'var(--page-muted)', fontSize: 11 },
        labelBgStyle: { fill: 'var(--surface)' },
        ariaLabel:
          edge.kind === 'dependency'
            ? `依赖：${edge.source.slice(5)} → ${edge.target.slice(5)}`
            : edge.label,
      })),
    [layout, showEdges],
  );

  return (
    <div className="border border-page-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-page-line px-4 py-3">
        <div>
          <p className="text-sm font-medium">嵌套执行计划</p>
          <p className="mt-1 text-xs text-page-muted">
            拖动背景平移 · Ctrl / ⌘ + 滚轮缩放 · 点击节点查看预期与执行步骤
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            className="ws-button"
            onClick={() => setShowEdges(!showEdges)}
            aria-pressed={showEdges}
          >
            依赖连线
          </Button>
          <Button
            className="ws-button"
            aria-label="缩小画板"
            disabled={!layout}
            onClick={() => void flow.zoomOut()}
          >
            −
          </Button>
          <span className="w-10 text-center font-mono text-xs">{Math.round(view.zoom * 100)}%</span>
          <Button
            className="ws-button"
            aria-label="放大画板"
            disabled={!layout}
            onClick={() => void flow.zoomIn()}
          >
            +
          </Button>
          <Button
            className="ws-button"
            disabled={!layout}
            onClick={() => void flow.fitView({ padding: 0.12, maxZoom: 1 })}
          >
            适应画板
          </Button>
          <Button
            className="ws-button"
            disabled={!layout}
            onClick={() => void flow.setViewport({ x: 24, y: 24, zoom: 1 })}
          >
            重置
          </Button>
        </div>
      </div>
      <div className="grid min-w-0 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div
          className="plan-viewport"
          aria-label="计划画板"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            const delta: Record<string, [number, number]> = {
              ArrowLeft: [40, 0],
              ArrowRight: [-40, 0],
              ArrowUp: [0, 40],
              ArrowDown: [0, -40],
            };
            const movement = delta[event.key];

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
            <ReactFlow<PlanFlowNode>
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
              minZoom={0.05}
              maxZoom={2}
              fitView
              fitViewOptions={{ padding: 0.12, maxZoom: 1 }}
            >
              <Background color="var(--plan-grid)" gap={20} size={1} />
            </ReactFlow>
          ) : (
            <div className="p-6 text-sm text-page-muted" role="status">
              {layoutError ? (
                <>
                  计划布局失败。
                  <Button
                    className="ws-button ml-3"
                    onClick={() => {
                      setLayoutError(false);
                      setAttempt((value) => value + 1);
                    }}
                  >
                    重试
                  </Button>
                </>
              ) : (
                '正在整理计划布局…'
              )}
            </div>
          )}
        </div>
        <aside
          className="min-w-0 border-t border-page-line p-5 lg:border-t-0 lg:border-l"
          aria-label="计划节点详情"
        >
          {node ? (
            <>
              <p className="font-mono text-xs text-page-muted">
                {node.kind.toUpperCase()} / {node.id}
              </p>
              <h3 className="mt-3 text-sm leading-6">
                {node.kind === 'branch' ? node.condition : node.goal}
              </h3>
              {node.kind === 'task' &&
                node.assertions.map((a, i) => (
                  <p key={i} className="mt-3 border-l-2 border-brand pl-3 text-xs leading-6">
                    预期：{a.description}
                  </p>
                ))}
              {node.dependsOn.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-xs text-page-muted">前置依赖</p>
                  {node.dependsOn.map((dep) => (
                    <Button key={dep} className="plan-reference" onClick={() => setSelected(dep)}>
                      {dep} ↗
                    </Button>
                  ))}
                </div>
              )}
              <p className="mt-6 mb-3 text-xs text-page-muted">该节点的录制步骤</p>
              {selectedSteps.map((s) => (
                <Button
                  key={s.id}
                  className="mb-2 w-full border border-page-line p-3 text-left text-xs leading-5 hover:border-brand"
                  onClick={() => onStep(s)}
                >
                  <span className={`ws-status ${s.status}`}>
                    <span />#{s.sequence}
                  </span>
                  <span className="mt-1 block">{s.title}</span>
                </Button>
              ))}
              {!selectedSteps.length && (
                <p className="text-xs leading-6 text-page-muted">
                  尚无关联步骤。旧录制未保存节点关联；分组的步骤位于子节点。
                </p>
              )}
            </>
          ) : (
            <p className="text-xs leading-6 text-page-muted">
              选择一个节点，查看任务、断言和对应的录制步骤。
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
