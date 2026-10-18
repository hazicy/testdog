'use client';

import { useTranslations } from 'next-intl';

import clsx from 'clsx';

import workspaceStyles from '@/features/workspace/components/workspace-index.module.css';
import styles from './Workspace.module.css';

import { useRunSubmission } from '@/client/useRunSubmission';
import { Button } from '@/components/ui/Button';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { TestCase } from '@testdog/contracts/test-cases/types';
import type { TestRun, RunSummary } from '@testdog/contracts/runs/types';
import { downloadRunReport } from '@/client/download';
import { writeCaseDraft } from '@/features/test-cases/lib/caseDraft';
import { useAuthoring } from '@/features/test-cases/hooks/useAuthoring';
import { DeleteTestDialog } from '@/features/test-cases/components/DeleteTestDialog';
import { QuickCreateDialog } from '@/features/test-cases/components/QuickCreateDialog';
import { Icon } from '@iconify/react/offline';
import canvasIcon from '@iconify-icons/lucide/panels-top-left';
import lightningIcon from '@iconify-icons/lucide/zap';
import { useWorkspaceData } from '@/features/workspace/hooks/useWorkspaceData';
import { WorkspaceList } from '@/features/workspace/components/WorkspaceList';
import { PageHeader } from '@/components/shared/PageHeader';
import { ErrorState } from '@/components/shared/ErrorState';

export function Workspace({
  view,
  folderId,
  title,
  actions,
}: {
  view: 'tests' | 'results';
  folderId?: string | null;
  title?: string;
  actions?: React.ReactNode;
}) {
  const t = useTranslations('workspace');
  const { editablePlan, emptyPlan, caseName } = useAuthoring();
  const promptContainer = useRef<HTMLElement>(null);
  const isTests = view === 'tests';
  const data = useWorkspaceData(isTests, folderId);
  const { tests, runs, loading, error, setError, latestRuns, running, refresh } = data;
  const submit = useRunSubmission();
  const router = useRouter();
  const params = useSearchParams();
  const previewState = process.env.NODE_ENV === 'development' ? params.get('previewState') : null;
  const previewEmpty = previewState === 'empty';
  const previewLoading = previewState === 'loading';
  const [starting, setStarting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState<TestCase | null>(null);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const selectedId = params.get('run');

  useEffect(() => {
    if (selectedId) router.replace(`/runs/${selectedId}`);
  }, [selectedId, router]);

  function openEditor(test?: TestCase, duplicate = false) {
    if (test && !duplicate && folderId !== undefined) {
      router.push(
        `/cases?${new URLSearchParams({ ...(folderId ? { folder: folderId } : {}), case: test.id })}`,
      );

      return;
    }

    const id = crypto.randomUUID();
    const name = test ? `${test.name}${duplicate ? t('copySuffix') : ''}` : caseName('');

    writeCaseDraft(id, {
      test,
      duplicate,
      folderId,
      name,
      goal: test?.goal ?? '',
      plan: test?.plan ? editablePlan(test.plan, name) : emptyPlan(name),
    });
    router.push(`/cases/editor/${id}${folderId ? `?folder=${folderId}` : ''}`);
  }

  async function start(testId: string) {
    setStarting(true);
    setError('');
    try {
      const { run } = await submit<{ run: TestRun }>('/api/runs', { testId });

      router.push(`/runs/${run.id}`);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('startFailed'));
    } finally {
      setStarting(false);
    }
  }

  async function exportRun(run: RunSummary) {
    setExporting(true);
    setError('');
    try {
      await downloadRunReport(run.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('exportFailed'));
    } finally {
      setExporting(false);
    }
  }

  if (previewState === 'error' || previewState === 'not-found')
    return (
      <ErrorState
        illustration={previewState}
        message={previewState === 'not-found' ? t('notFound') : t('unavailable')}
        retry={
          previewState === 'error' ? () => router.replace(isTests ? '/cases' : '/runs') : undefined
        }
      />
    );

  const testActions = isTests ? (
    <>
      {actions}
      <Button
        size="sm"
        className={workspaceStyles.caseCreateButton}
        onClick={() => setQuickCreateOpen(true)}
      >
        <Icon icon={lightningIcon} width="16" aria-hidden="true" />
        {t('quickCreate')}
      </Button>
      <Button
        size="sm"
        variant="primary"
        className={workspaceStyles.caseCreateButton}
        onClick={() => openEditor()}
      >
        <Icon icon={canvasIcon} width="16" aria-hidden="true" />
        {t('newTest')}
      </Button>
    </>
  ) : undefined;

  return (
    <div
      ref={(element) => {
        promptContainer.current = element?.closest<HTMLElement>('#main-content') ?? null;
      }}
      className={clsx(
        workspaceStyles.workspaceIndex,
        styles.container,
        workspaceStyles.dataWorkspace,
      )}
    >
      <PageHeader title={title ?? (isTests ? t('tests') : t('runs'))} actions={testActions} />
      {error && !previewEmpty && !previewLoading && (
        <div role="alert" className={styles.error}>
          <span>{error}</span>
          <Button
            onClick={() => void refresh()}
            variant="ghost"
            size="sm"
            className={styles.action}
          >
            {t('retry')}
          </Button>
        </div>
      )}
      <WorkspaceList
        query={data.query}
        setQuery={data.setQuery}
        filter={data.filter}
        setFilter={data.setFilter}
        page={data.page}
        hasPrevious={previewEmpty || previewLoading ? false : data.hasPrevious}
        hasNext={previewEmpty || previewLoading ? false : data.hasNext}
        nextPage={data.nextPage}
        previousPage={data.previousPage}
        isTests={isTests}
        tests={previewEmpty || previewLoading ? [] : tests}
        runs={previewEmpty || previewLoading ? [] : runs}
        loading={previewLoading || (!previewEmpty && loading)}
        latestRuns={latestRuns}
        running={previewEmpty || previewLoading ? false : running}
        starting={starting}
        exporting={exporting}
        openEditor={openEditor}
        setDeleting={setDeleting}
        start={start}
        exportRun={exportRun}
      />
      {quickCreateOpen && (
        <QuickCreateDialog
          folderId={folderId}
          container={promptContainer}
          onClose={() => setQuickCreateOpen(false)}
        />
      )}
      {deleting && (
        <DeleteTestDialog
          test={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={async () => {
            await refresh();
            setDeleting(null);
          }}
        />
      )}
    </div>
  );
}
