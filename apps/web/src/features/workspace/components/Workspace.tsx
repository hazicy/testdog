'use client';

import { createId } from '@/client/id';

import { useTranslations } from 'next-intl';

import clsx from 'clsx';

import workspaceStyles from '@/features/workspace/components/workspace-index.module.css';
import styles from './Workspace.module.css';

import { useRunSubmission } from '@/client/useRunSubmission';
import { Button } from '@/components/ui/Button';
import { useRouter, useSearchParams } from 'next/navigation';
import { useContext, useEffect, useRef, useState } from 'react';
import { FolderActionsContext } from '@/features/suites/context';
import folderPlusIcon from '@iconify-icons/lucide/folder-plus';
import moveIcon from '@iconify-icons/lucide/folder-input';
import type { TestCase } from '@testdog/contracts/test-cases/types';
import type { TestRun, RunSummary } from '@testdog/contracts/runs/types';
import { downloadRunReport } from '@/client/download';
import { writeCaseDraft } from '@/features/test-cases/lib/caseDraft';
import { useAuthoring } from '@/features/test-cases/hooks/useAuthoring';
import { DeleteTestDialog } from '@/features/test-cases/components/DeleteTestDialog';
import { QuickCreateDialog } from '@/features/test-cases/components/QuickCreateDialog';
import { Icon } from '@iconify/react/offline';
import plusIcon from '@iconify-icons/lucide/plus';
import sparklesIcon from '@iconify-icons/lucide/sparkles';
import playIcon from '@iconify-icons/lucide/play';
import { WorkspaceRowMenu } from './WorkspaceRowMenu';
import type { CaseBatchRequest } from '@testdog/contracts/test-cases/batchRuns';
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
  const folderActions = useContext(FolderActionsContext);
  const suites = useTranslations('suites');
  const data = useWorkspaceData(isTests, folderId ?? undefined);
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

    const id = createId();
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

  async function startBatch(selectedIds: string[]) {
    if (starting || !selectedIds.length) return;
    setStarting(true);
    setError('');
    const payload: CaseBatchRequest = { mode: 'selected', testIds: selectedIds };

    try {
      const { batchId } = await submit<{ batchId: string }>('/api/tests/runs', payload);

      router.push(`/cases/batches/${batchId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('startFailed'));
    } finally {
      setStarting(false);
    }
  }

  const testActions = isTests
    ? (selectedIds: string[], clearSelection: () => void) => (
        <>
          {actions}
          {selectedIds.length > 0 && (
            <>
              <span className={workspaceStyles.selectionCount}>
                {t('selectedCount', { count: selectedIds.length })}
              </span>
              {folderActions && (
                <Button
                  size="sm"
                  onClick={() => folderActions.moveCases(selectedIds, clearSelection)}
                >
                  <Icon icon={moveIcon} width="16" aria-hidden="true" />
                  {suites('moveToCollection')}
                </Button>
              )}
            </>
          )}
          {!selectedIds.length && (
            <WorkspaceRowMenu
              label={t('add')}
              text={t('add')}
              icon={plusIcon}
              actions={[
                {
                  label: t('addTestsWithAI'),
                  accessibleLabel: t('addTestsWithAI'),
                  icon: sparklesIcon,
                  onSelect: () => setQuickCreateOpen(true),
                },
                {
                  label: t('addTestManually'),
                  accessibleLabel: t('addTestManually'),
                  icon: plusIcon,
                  onSelect: () => openEditor(),
                },
                ...(folderActions
                  ? [
                      {
                        label: suites('create'),
                        accessibleLabel: suites('create'),
                        icon: folderPlusIcon,
                        separatorBefore: true,
                        onSelect: folderActions.createFolder,
                      },
                    ]
                  : []),
              ]}
            />
          )}
          <Button
            size="sm"
            variant="primary"
            className={workspaceStyles.caseCreateButton}
            disabled={starting || loading || previewEmpty || previewLoading || !selectedIds.length}
            onClick={() => void startBatch(selectedIds)}
          >
            <Icon icon={playIcon} width="16" aria-hidden="true" />
            {starting
              ? suites('starting')
              : selectedIds.length
                ? t('runSelected', { count: selectedIds.length })
                : t('run')}
          </Button>
        </>
      )
    : undefined;

  return (
    <div
      ref={(element) => {
        promptContainer.current = element?.closest<HTMLElement>('#main-content') ?? null;
      }}
      className={clsx(workspaceStyles.workspaceIndex, workspaceStyles.dataWorkspace)}
    >
      <PageHeader title={title ?? (isTests ? t('tests') : t('runs'))} />
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
        actions={testActions}
        folderId={folderId}
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
