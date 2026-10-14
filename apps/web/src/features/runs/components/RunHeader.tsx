'use client';

import clsx from 'clsx';
import { Tooltip } from '@/components/ui/Tooltip';
import styles from './RunHeader.module.css';
import { statusStyles } from '@/components/ui/statusStyles';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { buttonStyles } from '@/components/ui/buttonStyles';
import { Icon } from '@iconify/react/offline';
import downloadIcon from '@iconify-icons/lucide/download';
import resultsIcon from '@iconify-icons/lucide/play';
import backIcon from '@iconify-icons/lucide/chevron-left';
import stopIcon from '@iconify-icons/lucide/square';
import recordIcon from '@iconify-icons/lucide/rotate-cw';
import { RunLayoutPopover, type RunLayout } from '@/features/runs/components/RunLayoutPopover';
import { isActiveRun, type TestRun } from '@testdog/contracts/runs/types';
import { statuses } from '@/features/runs/presentation';

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
  return (
    <header className={styles.header}>
      <div className={styles.identity}>
        {!embedded && (
          <Link
            href="/runs"
            className={buttonStyles({ variant: 'ghost', size: 'icon-sm' })}
            aria-label="返回执行记录"
            title="返回执行记录"
          >
            <Icon icon={backIcon} width="16" aria-hidden="true" />
          </Link>
        )}
        <div className={styles.titleGroup}>
          <p className={styles.accessibleLabel}>执行记录 / {id.slice(0, 8)}</p>
          <Tooltip content={run?.name} disabled={!run?.name}>
            <h1 className={styles.title} tabIndex={run?.name ? 0 : undefined}>
              {run?.name || '加载执行记录…'}
            </h1>
          </Tooltip>
          {run && (
            <span
              data-slot="status"
              data-status={run.status}
              className={clsx(statusStyles(run.status), styles.status)}
            >
              <span />
              {statuses[run.status]}
            </span>
          )}
        </div>
      </div>
      <div className={styles.executionActions} role="group" aria-label="执行操作">
        {run && isActiveRun(run.status) ? (
          <Button
            variant="soft"
            size="sm"
            className={styles.executionButton}
            disabled={busy || run.cancelRequested}
            aria-label={run.cancelRequested ? '正在停止…' : '停止执行'}
            title={run.cancelRequested ? '正在停止…' : '停止执行'}
            onClick={() => void cancel()}
          >
            <Icon icon={stopIcon} width="16" aria-hidden="true" />
            {run.cancelRequested ? '正在停止…' : '停止'}
          </Button>
        ) : (
          run && (
            <>
              <Button
                disabled={busy || !run.replayable}
                title={
                  run.replayable
                    ? '按记录的动作顺序重新执行，重新验证断言'
                    : '需要成功执行且每个操作都有稳定定位器'
                }
                variant="soft"
                size="sm"
                className={styles.executionButton}
                aria-label="重放操作"
                onClick={() => void start('replay')}
              >
                <Icon icon={resultsIcon} width="16" aria-hidden="true" />
                重放
              </Button>
              {run.testId && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className={styles.recordButton}
                  aria-label="重新录制"
                  title="重新录制"
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
          aria-label="导出执行报告"
          title="导出执行报告"
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
