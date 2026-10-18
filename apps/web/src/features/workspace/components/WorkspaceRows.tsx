import { useTranslations, useFormatter } from 'next-intl';
import clsx from 'clsx';
import workspaceStyles from '@/features/workspace/components/workspace-index.module.css';
import styles from './WorkspaceRows.module.css';
import { TableRow, TableCell } from '@/components/ui/Table';
import { StatusBadge } from '@/components/shared/StatusBadge';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { buttonStyles } from '@/components/ui/buttonStyles';
import { Icon } from '@iconify/react/offline';
import chevronIcon from '@iconify-icons/lucide/chevron-right';
import copyIcon from '@iconify-icons/lucide/copy';
import downloadIcon from '@iconify-icons/lucide/download';
import editIcon from '@iconify-icons/lucide/pencil';
import resultsIcon from '@iconify-icons/lucide/play';
import trashIcon from '@iconify-icons/lucide/trash-2';
import matrixIcon from '@iconify-icons/lucide/grid-2x2';
import checkIcon from '@iconify-icons/lucide/circle-check';
import failIcon from '@iconify-icons/lucide/circle-x';
import pendingIcon from '@iconify-icons/lucide/circle-dashed';
import stoppedIcon from '@iconify-icons/lucide/circle-minus';
import { WorkspaceRowMenu } from '@/features/workspace/components/WorkspaceRowMenu';
import type { TestCase } from '@testdog/contracts/test-cases/types';
import type { RunSummary } from '@testdog/contracts/runs/types';

function Status({ status }: { status?: RunSummary['status'] }) {
  const t = useTranslations('workspace');

  return (
    <StatusBadge
      data-status={status || 'none'}
      tone={
        status === 'passed'
          ? 'success'
          : status === 'failed'
            ? 'danger'
            : status && status !== 'cancelled'
              ? 'warning'
              : 'neutral'
      }
    >
      <Icon
        icon={
          status === 'passed'
            ? checkIcon
            : status === 'failed'
              ? failIcon
              : status === 'cancelled'
                ? stoppedIcon
                : pendingIcon
        }
        width="16"
        aria-hidden="true"
      />
      {status ? t(status) : t('none')}
    </StatusBadge>
  );
}

function address(value: string) {
  try {
    const url = new URL(value);

    return `${url.host}${url.pathname === '/' ? '' : url.pathname}`;
  } catch {
    return value;
  }
}

function duration(run: RunSummary) {
  return run.durationMs == null
    ? '—'
    : run.durationMs < 1000
      ? `${run.durationMs} ms`
      : `${(run.durationMs / 1000).toFixed(1)} s`;
}

type Props = {
  isTests: boolean;
  visibleTests: TestCase[];
  visibleRuns: RunSummary[];
  latestRuns: Map<string, RunSummary>;
  running: boolean;
  starting: boolean;
  exporting: boolean;
  openEditor: (test?: TestCase, duplicate?: boolean) => void;
  openMatrix: (test: TestCase) => void;
  setDeleting: (test: TestCase) => void;
  start: (testId: string) => Promise<void>;
  exportRun: (run: RunSummary) => Promise<void>;
};

export function WorkspaceRows({
  isTests,
  visibleTests,
  visibleRuns,
  latestRuns,
  running,
  starting,
  exporting,
  openEditor,
  openMatrix,
  setDeleting,
  start,
  exportRun,
}: Props) {
  const t = useTranslations('workspace');
  const format = useFormatter();
  const date = (value: string) =>
    format.dateTime(new Date(value), {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  const latest = (id: string) => latestRuns.get(id);

  return (
    <>
      {isTests
        ? visibleTests.map((test) => {
            const run = latest(test.id);

            return (
              <TableRow key={test.id}>
                <TableCell>
                  <div className={workspaceStyles.workspaceIndexTitle}>
                    <Button
                      onClick={() => openEditor(test)}
                      variant="ghost"
                      className={clsx(workspaceStyles.workspaceIndexName, styles.action)}
                    >
                      <span className={workspaceStyles.workspaceIndexNameText} title={test.name}>
                        {test.name}
                      </span>
                    </Button>
                  </div>
                  <div className={workspaceStyles.workspaceIndexMeta}>
                    <p className={workspaceStyles.workspaceIndexDescription} title={test.url}>
                      {test.target && test.target.platform !== 'web'
                        ? `${test.target.platform} · ${test.target.appId}`
                        : address(test.url)}
                    </p>
                    {test.tags.length > 0 && (
                      <div className={workspaceStyles.workspaceIndexTags}>
                        {test.tags.map((tag, index) => (
                          <span
                            key={`${tag}-${index}`}
                            className={workspaceStyles.workspaceIndexTag}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Status status={run?.status} />
                </TableCell>
                <TableCell>
                  {run ? (
                    <Link href={`/runs/${run.id}`} className={styles.link}>
                      <time
                        dateTime={run.startedAt}
                        title={format.dateTime(new Date(run.startedAt), {
                          dateStyle: 'medium',
                          timeStyle: 'medium',
                        })}
                      >
                        {date(run.startedAt)}
                      </time>
                    </Link>
                  ) : (
                    <span className={styles.label}>—</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className={styles.container}>
                    <Button
                      size="xs"
                      variant="ghost"
                      title={running ? t('waitToRun') : t('runTest')}
                      disabled={starting}
                      onClick={() => void start(test.id)}
                    >
                      <Icon icon={resultsIcon} width="16" aria-hidden="true" /> {t('run')}
                    </Button>
                    <WorkspaceRowMenu
                      label={t('moreActions', { name: test.name })}
                      actions={[
                        {
                          label: t('editCase'),
                          accessibleLabel: t('edit', { name: test.name }),
                          icon: editIcon,
                          onSelect: () => openEditor(test),
                        },
                        {
                          label: t('duplicateCase'),
                          accessibleLabel: t('duplicate', { name: test.name }),
                          icon: copyIcon,
                          onSelect: () => openEditor(test, true),
                        },
                        {
                          label: t('runMatrix'),
                          accessibleLabel: t('matrix', { name: test.name }),
                          icon: matrixIcon,
                          disabled: starting,
                          onSelect: () => openMatrix(test),
                        },
                        {
                          label: t('deleteCase'),
                          accessibleLabel: t('delete', { name: test.name }),
                          icon: trashIcon,
                          danger: true,
                          onSelect: () => setDeleting(test),
                        },
                      ]}
                    />
                  </div>
                </TableCell>
              </TableRow>
            );
          })
        : visibleRuns.map((run) => (
            <TableRow key={run.id}>
              <TableCell>
                <Link
                  href={`/runs/${run.id}`}
                  className={clsx(workspaceStyles.workspaceIndexName, styles.runLink)}
                >
                  <span className={workspaceStyles.workspaceIndexNameText} title={run.name}>
                    {run.name}
                  </span>
                </Link>
                <p className={workspaceStyles.workspaceIndexDescription}>
                  <span className={workspaceStyles.workspaceIndexId}>#{run.id.slice(0, 8)}</span>
                  <span className={workspaceStyles.workspaceIndexMetaSeparator} aria-hidden="true">
                    ·
                  </span>
                  {address(run.url)}
                </p>
              </TableCell>
              <TableCell>
                <Status status={run.status} />
              </TableCell>
              <TableCell className={workspaceStyles.workspaceIndexTime}>
                <time
                  dateTime={run.startedAt}
                  title={format.dateTime(new Date(run.startedAt), {
                    dateStyle: 'medium',
                    timeStyle: 'medium',
                  })}
                >
                  {date(run.startedAt)}
                </time>
              </TableCell>
              <TableCell className={styles.tableCell}>{duration(run)}</TableCell>
              <TableCell>
                <div className={styles.runActions}>
                  <Link
                    href={`/runs/${run.id}`}
                    className={buttonStyles({
                      size: 'xs',
                      variant: 'ghost',
                    })}
                  >
                    {t('details')} <Icon icon={chevronIcon} width="13" aria-hidden="true" />
                  </Link>
                  <WorkspaceRowMenu
                    label={t('moreActions', { name: run.name })}
                    actions={[
                      {
                        label: t('exportResults'),
                        accessibleLabel: t('export', { name: run.name }),
                        icon: downloadIcon,
                        disabled: exporting,
                        onSelect: () => void exportRun(run),
                      },
                    ]}
                  />
                </div>
              </TableCell>
            </TableRow>
          ))}
    </>
  );
}
