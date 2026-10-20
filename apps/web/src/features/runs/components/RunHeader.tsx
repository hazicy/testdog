'use client';

import { useTranslations } from 'next-intl';

import { Tooltip } from '@/components/ui/Tooltip';
import styles from './RunHeader.module.css';
import { StatusBadge } from '@/components/shared/StatusBadge';

import { Button } from '@/components/ui/Button';

import { Icon } from '@iconify/react/offline';
import downloadIcon from '@iconify-icons/lucide/download';
import resultsIcon from '@iconify-icons/lucide/play';
import { BackLink } from '@/components/shared/BackLink';
import stopIcon from '@iconify-icons/lucide/square';
import recordIcon from '@iconify-icons/lucide/rotate-cw';
import { RunLayoutPopover } from '@/features/runs/components/RunLayoutPopover';
import type { RunLayout } from '@/features/runs/lib/runLayout';
import { isActiveRun, type TestRun } from '@testdog/contracts/runs/types';

type Props = {
  id: string;
  embedded?: boolean;
  run?: TestRun;
  layout: RunLayout;
  changeLayout: (layout: RunLayout) => void;
  busy: boolean;
  exporting: boolean;
  start: (mode: 'record' | 'replay') => Promise<void>;
  cancel: () => Promise<void>;
  exportReport: () => Promise<void>;
};

export function RunHeader({
  id,
  embedded = false,
  run,
  layout,
  changeLayout,
  busy,
  exporting,
  start,
  cancel,
  exportReport,
}: Props) {
  const t = useTranslations('runs');
  const statusText = useTranslations('workspace');

  return (
    <header className={styles.header}>
      <div className={styles.identity}>
        {!embedded && (
          <div className={styles.backLink}>
            <BackLink href="/runs" iconOnly>
              {t('backToRuns')}
            </BackLink>
          </div>
        )}
        <div className={styles.titleGroup}>
          <p className={styles.accessibleLabel}>{t('runId', { id: id.slice(0, 8) })}</p>
          <Tooltip content={run?.name} disabled={!run?.name}>
            <h1 className={styles.title} tabIndex={run?.name ? 0 : undefined}>
              {run?.name || t('loadingRun')}
            </h1>
          </Tooltip>
          {run && (
            <StatusBadge
              data-status={run.status}
              className={styles.status}
              tone={
                run.status === 'passed'
                  ? 'success'
                  : run.status === 'failed'
                    ? 'danger'
                    : isActiveRun(run.status)
                      ? 'warning'
                      : 'neutral'
              }
            >
              <span />
              {statusText(run.status)}
            </StatusBadge>
          )}
        </div>
      </div>
      <div className={styles.executionActions} role="group" aria-label={t('runActions')}>
        {run && isActiveRun(run.status) ? (
          <Button
            variant="soft"
            size="sm"
            className={styles.executionButton}
            disabled={busy || run.cancelRequested}
            aria-label={run.cancelRequested ? t('stopping') : t('stopRun')}
            title={run.cancelRequested ? t('stopping') : t('stopRun')}
            onClick={() => void cancel()}
          >
            <Icon icon={stopIcon} width="16" aria-hidden="true" />
            {run.cancelRequested ? t('stopping') : t('stop')}
          </Button>
        ) : (
          run && (
            <>
              <Button
                disabled={busy || !run.replayable}
                title={run.replayable ? t('replayHint') : t('recordFirst')}
                variant="soft"
                size="sm"
                className={styles.executionButton}
                aria-label={t('rerun')}
                onClick={() => void start('replay')}
              >
                <Icon icon={resultsIcon} width="16" aria-hidden="true" />
                {t('rerun')}
              </Button>
              {run.testId && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className={styles.recordButton}
                  aria-label={t('rerecord')}
                  title={t('rerecord')}
                  disabled={busy}
                  onClick={() => void start('record')}
                >
                  <Icon icon={recordIcon} width="16" aria-hidden="true" />
                </Button>
              )}
            </>
          )
        )}
        <Button
          disabled={!run || exporting}
          variant="ghost"
          size="icon-xs"
          className={styles.recordButton}
          aria-label={t('exportReport')}
          title={t('exportReport')}
          onClick={() => void exportReport()}
        >
          <Icon icon={downloadIcon} width="16" aria-hidden="true" />
        </Button>
      </div>
      <div className={styles.layoutActions}>
        <RunLayoutPopover value={layout} onChange={changeLayout} />
      </div>
    </header>
  );
}
