'use client';

import { useTranslations } from 'next-intl';

import { Icon } from '@iconify/react/offline';
import chevronIcon from '@iconify-icons/lucide/chevron-right';
import folderIcon from '@iconify-icons/lucide/folder';
import referenceIcon from '@iconify-icons/lucide/corner-up-left';
import { memo, useEffect, useId, useMemo, useRef } from 'react';
import type { Plan } from '@testdog/contracts/automation/compiler/schema';
import { executionGroups, type ExecutionGroup } from '@/features/runs/lib/executionGroups';
import { stepResult } from '@/features/runs/lib/boardResults';
import { statusStyles } from '@/components/ui/statusStyles';
import { Collapsible } from '@/components/ui/Collapsible';
import { ExecutionActions, type ExecutionActionsProps } from './ExecutionActions';
import styles from './StepList.module.css';

function expand(root: Element) {
  const trigger = root.querySelector<HTMLButtonElement>(
    ':scope > [data-slot="collapsible-trigger"]',
  );

  if (trigger?.getAttribute('aria-expanded') === 'false') trigger.click();
}

function revealNode(id: string) {
  const target = document.getElementById(id);

  if (!target) return;

  for (let parent = target.parentElement; parent; parent = parent.parentElement)
    if (parent.matches('[data-slot="collapsible"]')) expand(parent);
  requestAnimationFrame(() => {
    target.scrollIntoView({ block: 'nearest' });
    target.focus({ preventScroll: true });
  });
}

function PlannedStep({
  entry,
  number,
  scopeId,
  actions,
}: {
  entry: ExecutionGroup;
  number: number;
  scopeId: string;
  actions: ExecutionActionsProps;
}) {
  const t = useTranslations('runs');
  const statusText = useTranslations('workspace');
  const ref = useRef<HTMLDivElement>(null);
  const { status } = stepResult(entry.steps);
  const selected = entry.steps.some((step) => step.id === actions.selectedId)
    ? actions.selectedId
    : undefined;
  const isGroup = entry.kind === 'group';
  const showStatus = !isGroup || status === 'running' || status === 'failed';

  useEffect(() => {
    if (ref.current && (selected || status === 'running' || status === 'failed'))
      expand(ref.current);
  }, [selected, status]);

  if (entry.reference)
    return (
      <li className={styles.plannedStep}>
        <button
          id={`${scopeId}-${entry.id}`}
          type="button"
          className={styles.reference}
          onClick={() => revealNode(`${scopeId}-${entry.reference}`)}
        >
          <Icon icon={referenceIcon} width="12" aria-hidden="true" />
          <span>
            {entry.pathLabel && `${t(entry.pathLabel as 'yesCondition' | 'noCondition')} · `}
            {entry.title}
          </span>
        </button>
      </li>
    );

  return (
    <li
      className={styles.plannedStep}
      data-kind={entry.kind}
      data-current={!isGroup && (!!selected || status === 'running') ? true : undefined}
    >
      <Collapsible
        ref={ref}
        defaultOpen={isGroup}
        trigger={
          <button type="button" id={`${scopeId}-${entry.id}`} className={styles.planSummary}>
            <span className={styles.stepNumber} aria-hidden="true">
              {isGroup ? <Icon icon={folderIcon} width="14" /> : number}
            </span>
            <span className={styles.content}>
              {entry.pathLabel && (
                <span className={styles.pathLabel}>
                  {t(entry.pathLabel as 'yesCondition' | 'noCondition')}
                </span>
              )}
              <span className={styles.planTitle}>{entry.title}</span>
            </span>
            {showStatus && (
              <span data-slot="status" data-status={status} className={statusStyles(status)}>
                {status === 'none' ? t('noStepActions') : statusText(status)}
              </span>
            )}
            <Icon icon={chevronIcon} width="12" className={styles.chevron} aria-hidden="true" />
          </button>
        }
      >
        {entry.actions.length > 0 && (
          <div className={styles.planActions}>
            <ExecutionActions {...actions} steps={entry.actions} />
          </div>
        )}
        {entry.children.length > 0 && (
          <ol className={styles.nestedGroups}>
            {entry.children.map((child, index) => (
              <PlannedStep
                key={child.id}
                entry={child}
                number={index + 1}
                scopeId={scopeId}
                actions={actions}
              />
            ))}
          </ol>
        )}
      </Collapsible>
    </li>
  );
}

export const StepList = memo(function StepList({
  plan,
  running,
  ...actions
}: ExecutionActionsProps & { plan?: Plan; running: boolean }) {
  const t = useTranslations('runs');
  const scopeId = useId();
  const { groups, ungrouped } = useMemo(
    () => executionGroups(plan, actions.steps),
    [plan, actions.steps],
  );

  return (
    <section aria-label={t('steps')} className={styles.section}>
      {groups.length > 0 && (
        <ol className={styles.groups}>
          {groups.map((entry, index) => (
            <PlannedStep
              key={entry.id}
              entry={entry}
              number={index + 1}
              scopeId={scopeId}
              actions={actions}
            />
          ))}
        </ol>
      )}
      {ungrouped.length > 0 && (
        <>
          {groups.length > 0 && <h2 className={styles.ungroupedHeading}>{t('otherActions')}</h2>}
          <ExecutionActions {...actions} steps={ungrouped} />
        </>
      )}
      {!groups.length && !actions.steps.length && (
        <p className={styles.description}>{running ? t('generatingPlan') : t('noSteps')}</p>
      )}
    </section>
  );
});
