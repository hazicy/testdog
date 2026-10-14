'use client';

import { Icon } from '@iconify/react/offline';
import chevronIcon from '@iconify-icons/lucide/chevron-right';
import { memo, useEffect, useMemo, useRef, type ReactNode } from 'react';
import type { Plan } from '@testdog/contracts/automation/compiler/schema';
import { layoutPlan } from '@/features/runs/lib/planLayout';
import {
  boardNodeSteps,
  indexStepsByNode,
  planNodeTitle,
  stepResult,
} from '@/features/runs/lib/boardResults';
import { statusStyles } from '@/components/ui/statusStyles';
import { statuses } from '@/features/runs/presentation';
import { ExecutionActions, type ExecutionActionsProps } from './ExecutionActions';
import styles from './StepList.module.css';

function PlannedStep({
  number,
  title,
  pathLabel,
  steps,
  selectedId,
  children,
}: Pick<ExecutionActionsProps, 'steps' | 'selectedId'> & {
  number: number;
  title: string;
  pathLabel?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const { status } = stepResult(steps);
  const selected = steps.some((step) => step.id === selectedId) ? selectedId : undefined;

  useEffect(() => {
    if (ref.current && (selected || status === 'running' || status === 'failed'))
      ref.current.open = true;
  }, [selected, status]);

  return (
    <li
      className={styles.plannedStep}
      data-current={!!selected || status === 'running' ? true : undefined}
    >
      <details ref={ref}>
        <summary className={styles.planSummary}>
          <span className={styles.stepNumber} aria-hidden="true">
            {number}
          </span>
          <span className={styles.content}>
            {pathLabel && <span className={styles.pathLabel}>{pathLabel}</span>}
            <span className={styles.planTitle}>{title}</span>
          </span>
          <span data-slot="status" data-status={status} className={statusStyles(status)}>
            {status === 'none' ? '暂无动作' : statuses[status]}
          </span>
          <Icon icon={chevronIcon} width="12" className={styles.chevron} aria-hidden="true" />
        </summary>
        <div className={styles.planActions}>{children}</div>
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
  const entries = useMemo(
    () =>
      plan
        ? layoutPlan(plan)
            .nodes.filter((item) => !item.reference && plan.nodes[item.planNodeId].kind !== 'group')
            .map((item) => ({
              id: item.id,
              node: plan.nodes[item.planNodeId],
              assertionIndex: item.assertionIndex,
              title: planNodeTitle(plan.nodes[item.planNodeId], item.assertionIndex),
              pathLabel: item.pathLabel,
            }))
        : [],
    [plan],
  );
  const stepsByNode = useMemo(() => indexStepsByNode(steps), [steps]);
  const groups = entries.map((entry) => ({
    id: entry.id,
    title: entry.title,
    pathLabel: entry.pathLabel,
    steps: boardNodeSteps(entry.node, stepsByNode.get(entry.node.id) ?? [], entry.assertionIndex),
  }));
  const groupedIds = new Set(groups.flatMap((group) => group.steps.map((step) => step.id)));
  const ungrouped = steps.filter((step) => !groupedIds.has(step.id));

  return (
    <section aria-label="执行步骤" className={styles.section}>
      {groups.length > 0 && (
        <ol className={styles.groups}>
          {groups.map((group, index) => (
            <PlannedStep key={group.id} {...group} number={index + 1} selectedId={selectedId}>
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
