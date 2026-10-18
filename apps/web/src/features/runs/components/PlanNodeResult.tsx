'use client';

import Image from 'next/image';
import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { asset } from '@/features/runs/presentation';
import type { PlanFlowNode } from './PlanNodes';
import boardStyles from './plan-board.module.css';
import styles from './PlanNodes.module.css';

export function PlanNodeResult({
  data,
  result,
  content,
  assertion,
  expanded,
  actionsId,
  onToggle,
}: {
  data: Pick<PlanFlowNode['data'], 'node' | 'steps' | 'current' | 'onIssue' | 'onFrame'>;
  result: NonNullable<PlanFlowNode['data']['result']>;
  content: string;
  assertion: boolean;
  expanded: boolean;
  actionsId: string;
  onToggle: () => void;
}) {
  const t = useTranslations('runs');
  const { node, steps, onIssue } = data;
  const { primary, frame } = result;

  return (
    <div className={clsx(boardStyles.planResult, 'nodrag', 'nopan')}>
      <div className={boardStyles.planResultSummary}>
        {data.current && (
          <span className={boardStyles.planPlaybackMarker}>{t('playbackPosition')}</span>
        )}
        {result.durationMs !== undefined && (
          <span>
            {(result.durationMs / 1000).toFixed(1)}s · {t('stepCount', { count: steps.length })}
          </span>
        )}
        {assertion && <p>{t('expected', { value: content })}</p>}
        {primary?.evidence && <p>{t('evidence', { value: primary.evidence })}</p>}
        {primary?.error && <p className={boardStyles.planResultError}>{primary.error}</p>}
        {node.kind === 'branch' && primary?.decision !== undefined && (
          <p>
            {t('decision', {
              value: primary.decision ? t('yesCondition') : t('noCondition'),
            })}
          </p>
        )}
        {!steps.length && <p>{t('noResult')}</p>}
        {steps.length > 0 && !frame && <p>{t('noScreenshot')}</p>}
        {primary && (
          <Button
            type="button"
            aria-expanded={expanded}
            aria-controls={actionsId}
            onClick={onToggle}
          >
            {expanded ? t('collapseActions') : t('expandActions')}
          </Button>
        )}
        {primary && onIssue && (
          <Button type="button" className={styles.action} onClick={() => onIssue(primary)}>
            {t('createIssue')}
          </Button>
        )}
      </div>
      {frame && (
        <button
          type="button"
          className={boardStyles.planResultThumbnail}
          aria-label={t('viewScreenshot', { content })}
          onClick={() => data.onFrame?.(frame)}
        >
          <Image
            src={asset(frame.runId, frame)}
            alt={t('evidenceScreenshot', { content })}
            width={240}
            height={140}
            unoptimized
          />
          <span>
            {t('clickToReplay', {
              stage: frame.stage === 'before' ? t('beforeScreenshot') : t('runScreenshot'),
            })}
          </span>
        </button>
      )}
    </div>
  );
}
