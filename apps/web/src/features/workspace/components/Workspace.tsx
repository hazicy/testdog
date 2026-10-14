'use client';

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
import { targetUrl } from '@testdog/contracts/automation/platform/target';
import { editablePlan, emptyPlan, caseName } from '@/features/test-cases/lib/authoring';
import { DeleteTestDialog } from '@/features/test-cases/components/DeleteTestDialog';
import { RunMatrixDialog } from '@/features/test-cases/components/RunMatrixDialog';
import { QuickCreateDialog } from '@/features/test-cases/components/QuickCreateDialog';
import { Icon } from '@iconify/react/offline';
import canvasIcon from '@iconify-icons/lucide/panels-top-left';
import lightningIcon from '@iconify-icons/lucide/zap';
import { useWorkspaceData } from '@/features/workspace/hooks/useWorkspaceData';
import { WorkspaceList } from '@/features/workspace/components/WorkspaceList';
import { ErrorState } from '@/components/shared/ErrorState';

export function Workspace({ view }: { view: 'tests' | 'results' }) {
  const promptContainer = useRef<HTMLElement>(null);
  const isTests = view === 'tests';
  const data = useWorkspaceData(isTests);
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
  const [matrixTest, setMatrixTest] = useState<TestCase | null>(null);
  const [matrixError, setMatrixError] = useState('');
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const selectedId = params.get('run');

  useEffect(() => {
    if (selectedId) router.replace(`/runs/${selectedId}`);
  }, [selectedId, router]);

  function openEditor(test?: TestCase, duplicate = false) {
    const id = crypto.randomUUID();
    const name = test ? `${test.name}${duplicate ? '（副本）' : ''}` : caseName('');

    writeCaseDraft(id, {
      test,
      duplicate,
      name,
      url: test?.target ? targetUrl(test.target) : (test?.url ?? ''),
      goal: test?.goal ?? '',
      plan: test?.plan ? editablePlan(test.plan, name) : emptyPlan(name),
    });
    router.push(`/cases/editor/${id}`);
  }

  async function start(testId: string) {
    setStarting(true);
    setError('');
    try {
      const { run } = await submit<{ run: TestRun }>('/api/runs', { testId });

      router.push(`/runs/${run.id}`);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '启动失败');
    } finally {
      setStarting(false);
    }
  }

  function openMatrix(test: TestCase) {
    setMatrixTest(test);
    setMatrixError('');
  }

  async function startMatrix(event: React.FormEvent, matrixCode: string) {
    event.preventDefault();
    if (!matrixTest) return;
    setStarting(true);
    setMatrixError('');
    try {
      await submit('/api/run-batches', { testId: matrixTest.id, variants: JSON.parse(matrixCode) });
      setMatrixTest(null);
      router.push('/runs');
      await refresh();
    } catch (cause) {
      setMatrixError(cause instanceof Error ? cause.message : '矩阵启动失败');
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
      setError(cause instanceof Error ? cause.message : '导出失败');
    } finally {
      setExporting(false);
    }
  }

  if (previewState === 'error' || previewState === 'not-found')
    return (
      <ErrorState
        illustration={previewState}
        message={previewState === 'not-found' ? '页面不存在或已被移除' : '暂时无法加载，请稍后重试'}
        retry={
          previewState === 'error' ? () => router.replace(isTests ? '/cases' : '/runs') : undefined
        }
      />
    );

  return (
    <div
      ref={(element) => {
        promptContainer.current = element?.closest<HTMLElement>('#main-content') ?? null;
      }}
      className={clsx(workspaceStyles.workspaceIndex, styles.container)}
    >
      <h1 className={styles.accessibleLabel}>{isTests ? '测试用例' : '执行记录'}</h1>
      {error && !previewEmpty && !previewLoading && (
        <div role="alert" className={styles.error}>
          <span>{error}</span>
          <Button
            onClick={() => void refresh()}
            variant="ghost"
            size="sm"
            className={styles.action}
          >
            重试
          </Button>
        </div>
      )}
      <WorkspaceList
        actions={
          isTests ? (
            <>
              <Button
                size="sm"
                className={clsx(workspaceStyles.caseCreateButton, workspaceStyles.isQuick)}
                onClick={() => setQuickCreateOpen(true)}
              >
                <Icon icon={lightningIcon} width="16" aria-hidden="true" />
                快速创建
              </Button>
              <Button
                size="sm"
                variant="primary"
                className={clsx(workspaceStyles.caseCreateButton, workspaceStyles.isCanvas)}
                onClick={() => openEditor()}
              >
                <Icon icon={canvasIcon} width="16" aria-hidden="true" />
                新建测试
              </Button>
            </>
          ) : undefined
        }
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
        openMatrix={openMatrix}
        setDeleting={setDeleting}
        start={start}
        exportRun={exportRun}
      />
      {quickCreateOpen && (
        <QuickCreateDialog container={promptContainer} onClose={() => setQuickCreateOpen(false)} />
      )}
      {matrixTest && (
        <RunMatrixDialog
          test={matrixTest}
          busy={starting}
          error={matrixError}
          onClose={() => setMatrixTest(null)}
          onSubmit={startMatrix}
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
