'use client';

import { memo, useEffect, useId, useMemo, useRef, type ReactNode } from 'react';
import type { Plan } from '@testdog/contracts/automation/compiler/schema';
import { layoutPlan } from '@/features/runs/lib/planLayout';
import { boardNodeSteps, boardResult } from '@/features/runs/lib/boardResults';
import { statusStyles } from '@/components/ui/statusStyles';
import { statuses } from '@/features/runs/presentation';
import { ExecutionActions, type ExecutionActionsProps } from './ExecutionActions';
import styles from './StepList.module.css';

function PlannedStep({
  title,
  pathLabel,
  steps,
  selectedId,
  children,
}: Pick<ExecutionActionsProps, 'steps' | 'selectedId'> & {
  title: string;
  pathLabel?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const contentId = useId();
  const { status } = boardResult(steps, []);
  const selected = steps.some((step) => step.id === selectedId) ? selectedId : undefined;

  useEffect(() => {
    if (ref.current && (selected || status === 'running' || status === 'failed'))
      ref.current.open = true;
  }, [selected, status]);

  return (
    <li className={styles.plannedStep}>
      <details ref={ref}>
        <summary className={styles.planSummary} aria-controls={contentId}>
          <span className={styles.content}>
            {pathLabel && <span className={styles.pathLabel}>{pathLabel}</span>}
            <span className={styles.planTitle}>{title}</span>
          </span>
          <span data-slot="status" data-status={status} className={statusStyles(status)}>
            <span />
            {status === 'none' ? '未执行' : statuses[status]}
          </span>
        </summary>
        <div id={contentId} className={styles.planActions}>
          {children}
        </div>
      </details>
    </li>
  );
}

export const StepList = memo(function StepList({
  plan,
  running,
  ...actions
}: ExecutionActionsProps & { plan?: Plan; running: boolean }) {
  const { steps, selectedId } = actions;
  const groups = useMemo(
    () =>
      plan
        ? layoutPlan(plan)
            .nodes.filter((item) => !item.reference && plan.nodes[item.planNodeId].kind !== 'group')
            .map((item) => {
              const node = plan.nodes[item.planNodeId];
              return {
                id: item.id,
                title:
                  node.kind === 'branch'
                    ? node.condition
                    : item.assertionIndex !== undefined && node.kind === 'task'
                      ? node.assertions[item.assertionIndex].description
                      : node.goal,
                pathLabel: item.pathLabel,
                steps: boardNodeSteps(node, steps, item.assertionIndex),
              };
            })
        : [],
    [plan, steps],
  );
  const groupedIds = new Set(groups.flatMap((group) => group.steps.map((step) => step.id)));
  const ungrouped = steps.filter((step) => !groupedIds.has(step.id));

  return (
    <section aria-label="执行步骤" className={styles.section}>
      {groups.length > 0 && (
        <ol>
          {groups.map((group) => (
            <PlannedStep key={group.id} {...group} selectedId={selectedId}>
              {group.steps.length > 0 && <ExecutionActions {...actions} steps={group.steps} />}
            </PlannedStep>
          ))}
        </ol>
      )}
      {ungrouped.length > 0 && (
        <>
          {groups.length > 0 && <h2 className={styles.ungroupedHeading}>其他动作</h2>}
          <ExecutionActions {...actions} steps={ungrouped} />
        </>
      )}
      {!groups.length && !steps.length && (
        <p className={styles.description}>{running ? '正在生成计划…' : '暂无执行步骤'}</p>
      )}
    </section>
  );
});
