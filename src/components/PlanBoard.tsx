'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Plan } from '@/automation/compiler/schema';
import type { ExecutionStep } from '@/workspace/types';
import { planForest, type PlanTree } from '@/workspace/planTree';

type Edge = { key: string; x1: number; y1: number; x2: number; y2: number };
export function PlanBoard({
  plan,
  steps,
  onStep,
}: {
  plan?: Plan;
  steps: ExecutionStep[];
  onStep: (step: ExecutionStep) => void;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [view, setView] = useState({ x: 24, y: 24, scale: 1 });
  const [selected, setSelected] = useState<string>();
  const [edges, setEdges] = useState<Edge[]>([]);
  const [showEdges, setShowEdges] = useState(true);
  const forest = useMemo(() => (plan ? planForest(plan) : []), [plan]);
  const node = plan?.nodes[selected || ''];
  const fit = useCallback(() => {
    if (
      !viewport.current ||
      !stage.current ||
      !viewport.current.clientWidth ||
      !stage.current.offsetWidth
    )
      return;
    const scale = Math.min(
      1,
      (viewport.current.clientWidth - 48) / stage.current.offsetWidth,
      (viewport.current.clientHeight - 48) / stage.current.offsetHeight,
    );
    setView({ x: 24, y: 24, scale: Math.max(0.15, scale) });
  }, []);
  useEffect(() => {
    const surface = viewport.current;
    const content = stage.current;
    if (!surface || !content) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    };
    const observer = new ResizeObserver(update);
    observer.observe(surface);
    observer.observe(content);
    update();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [fit, plan?.rootId]);
  useEffect(() => {
    const surface = viewport.current;
    if (!surface) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = surface.getBoundingClientRect();
      setView((v) => {
        if (event.ctrlKey || event.metaKey) {
          const scale = Math.max(0.15, Math.min(2, v.scale * Math.exp(-event.deltaY * 0.005)));
          const px = event.clientX - rect.left,
            py = event.clientY - rect.top;
          return {
            scale,
            x: px - ((px - v.x) * scale) / v.scale,
            y: py - ((py - v.y) * scale) / v.scale,
          };
        }
        return { ...v, x: v.x - event.deltaX, y: v.y - event.deltaY };
      });
    };
    surface.addEventListener('wheel', wheel, { passive: false });
    return () => surface.removeEventListener('wheel', wheel);
  }, [plan]);
  useEffect(() => {
    const element = stage.current;
    if (!element || !plan) return;
    const update = () => {
      const root = element.getBoundingClientRect();
      const scale = root.width / element.offsetWidth;
      const positions = new Map<string, DOMRect>();
      element
        .querySelectorAll<HTMLElement>('[data-plan-node]')
        .forEach((el) => positions.set(el.dataset.planNode!, el.getBoundingClientRect()));
      const result: Edge[] = [];
      Object.values(plan.nodes).forEach((n) =>
        n.dependsOn.forEach((dep) => {
          const a = positions.get(dep),
            b = positions.get(n.id);
          if (a && b)
            result.push({
              key: `${dep}:${n.id}`,
              x1: (a.right - root.left) / scale,
              y1: (a.top + 26 * scale - root.top) / scale,
              x2: (b.left - root.left) / scale,
              y2: (b.top + 26 * scale - root.top) / scale,
            });
        }),
      );
      setEdges(result);
    };
    const observer = new ResizeObserver(update);
    observer.observe(element);
    update();
    return () => observer.disconnect();
  }, [plan, forest]);
  if (!plan)
    return (
      <p className="p-6 text-sm text-page-muted">
        {steps.length ? '此记录没有保存编译计划。' : '计划生成后会在此展示。'}
      </p>
    );
  function render(tree: PlanTree) {
    const n = plan!.nodes[tree.id];
    if (tree.reference)
      return (
        <button key={tree.id} className="plan-reference" onClick={() => setSelected(tree.id)}>
          ↗ 引用 {tree.id}
        </button>
      );
    const recorded = steps.filter((s) => s.planNodeId === n.id);
    const state = recorded.some((s) => s.status === 'failed')
      ? 'failed'
      : recorded.some((s) => s.status === 'running')
        ? 'running'
        : recorded.length
          ? 'passed'
          : 'none';
    return (
      <div
        key={tree.id}
        data-plan-node={n.id}
        className={`plan-node ${n.kind} ${selected === n.id ? 'active' : ''}`}
      >
        <button
          className="plan-node-header"
          onClick={() => setSelected(n.id)}
          aria-label={`查看节点 ${n.id}`}
        >
          <span className="flex items-center justify-between gap-4">
            <span className="font-mono text-xs tracking-wider text-page-muted">
              {n.kind.toUpperCase()} / {n.id}
            </span>
            {recorded.length > 0 && (
              <span className={`ws-status ${state}`}>
                <span />
                {recorded.length} 步
              </span>
            )}
          </span>
          <span className="mt-2 block text-left text-sm leading-6">
            {n.kind === 'branch' ? n.condition : n.goal}
          </span>
          {n.dependsOn.length > 0 && (
            <span className="mt-2 block text-left text-xs text-page-muted">
              依赖：{n.dependsOn.join(' · ')}
            </span>
          )}
          {n.kind === 'task' && (
            <span className="mt-2 block text-left text-xs text-page-muted">
              {n.assertions.length} 个预期
              {n.requirementIds.length ? ` · ${n.requirementIds.join(', ')}` : ''}
            </span>
          )}
        </button>
        {n.kind === 'group' && <div className="plan-children">{tree.children.map(render)}</div>}
        {n.kind === 'branch' && (
          <div className="plan-branches">
            <div>
              <p className="mb-3 font-mono text-xs text-[#6c805b]">YES / 条件成立</p>
              {tree.then && render(tree.then)}
            </div>
            <div>
              <p className="mb-3 font-mono text-xs text-page-muted">NO / 条件不成立</p>
              {tree.otherwise ? (
                render(tree.otherwise)
              ) : (
                <p className="text-xs text-page-muted">跳过</p>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="border border-page-line bg-[#fffefa]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-page-line px-4 py-3">
        <div>
          <p className="text-sm font-medium">嵌套执行计划</p>
          <p className="mt-1 text-xs text-page-muted">
            拖动背景平移 · Ctrl / ⌘ + 滚轮缩放 · 点击节点查看预期与执行步骤
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="ws-button"
            onClick={() => setShowEdges(!showEdges)}
            aria-pressed={showEdges}
          >
            依赖连线
          </button>
          <button
            className="ws-button"
            aria-label="缩小画板"
            onClick={() => setView((v) => ({ ...v, scale: Math.max(0.15, v.scale / 1.2) }))}
          >
            −
          </button>
          <span className="w-10 text-center font-mono text-xs">
            {Math.round(view.scale * 100)}%
          </span>
          <button
            className="ws-button"
            aria-label="放大画板"
            onClick={() => setView((v) => ({ ...v, scale: Math.min(2, v.scale * 1.2) }))}
          >
            +
          </button>
          <button className="ws-button" onClick={fit}>
            适应画板
          </button>
          <button className="ws-button" onClick={() => setView({ x: 24, y: 24, scale: 1 })}>
            重置
          </button>
        </div>
      </div>
      <div className="grid min-w-0 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div
          ref={viewport}
          className="plan-viewport"
          aria-label="计划画板"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.target !== e.currentTarget) return;
            const delta: Record<string, [number, number]> = {
              ArrowLeft: [40, 0],
              ArrowRight: [-40, 0],
              ArrowUp: [0, 40],
              ArrowDown: [0, -40],
            };
            if (delta[e.key]) {
              e.preventDefault();
              const [x, y] = delta[e.key];
              setView((v) => ({ ...v, x: v.x + x, y: v.y + y }));
            }
          }}
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest('button') || e.button !== 0) return;
            drag.current = { x: e.clientX, y: e.clientY, ox: view.x, oy: view.y };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (d) setView((v) => ({ ...v, x: d.ox + e.clientX - d.x, y: d.oy + e.clientY - d.y }));
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
        >
          <div
            ref={stage}
            className="plan-stage"
            style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
          >
            {forest.map((tree, index) => (
              <div key={tree.id}>
                {index > 0 && <p className="mb-3 text-xs text-page-muted">依赖 / 独立节点</p>}
                {render(tree)}
              </div>
            ))}
            {showEdges && (
              <svg className="plan-edges" aria-label="节点依赖连线">
                <defs>
                  <marker
                    id="dep-arrow"
                    markerWidth="8"
                    markerHeight="8"
                    refX="7"
                    refY="4"
                    orient="auto"
                  >
                    <path d="M0,0 L8,4 L0,8" fill="#9b977c" />
                  </marker>
                </defs>
                {edges.map((e) => (
                  <path
                    key={e.key}
                    d={`M${e.x1},${e.y1} C${e.x1 + 50},${e.y1} ${e.x2 - 50},${e.y2} ${e.x2},${e.y2}`}
                    stroke="#9b977c"
                    fill="none"
                    strokeWidth="1.5"
                    strokeDasharray="5 4"
                    markerEnd="url(#dep-arrow)"
                  >
                    <title>{e.key}</title>
                  </path>
                ))}
              </svg>
            )}
          </div>
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
                    <button key={dep} className="plan-reference" onClick={() => setSelected(dep)}>
                      {dep} ↗
                    </button>
                  ))}
                </div>
              )}
              <p className="mt-6 mb-3 text-xs text-page-muted">该节点的录制步骤</p>
              {steps
                .filter((s) => s.planNodeId === node.id)
                .map((s) => (
                  <button
                    key={s.id}
                    className="mb-2 w-full border border-page-line p-3 text-left text-xs leading-5 hover:border-brand"
                    onClick={() => onStep(s)}
                  >
                    <span className={`ws-status ${s.status}`}>
                      <span />#{s.sequence}
                    </span>
                    <span className="mt-1 block">{s.title}</span>
                  </button>
                ))}
              {!steps.some((s) => s.planNodeId === node.id) && (
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
