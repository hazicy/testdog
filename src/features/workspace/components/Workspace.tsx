'use client';

import { useRunSubmission } from '@/client/useRunSubmission';
import { Button } from '@/components/ui/Button';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { TestCase } from '@/features/test-cases/types';
import type { TestRun, RunSummary } from '@/features/runs/types';
import { Icon } from '@iconify/react/offline';
import plusIcon from '@iconify-icons/lucide/plus';
import testsIcon from '@iconify-icons/lucide/flask-conical';
import { downloadRunReport } from '@/client/download';
import { writeCaseDraft } from '@/features/test-cases/lib/caseDraft';
import { editablePlan, emptyPlan, caseName } from '@/features/test-cases/lib/authoring';
import { DeleteTestDialog } from '@/features/test-cases/components/DeleteTestDialog';
import { RunMatrixDialog } from '@/features/test-cases/components/RunMatrixDialog';
import { useWorkspaceData } from '../hooks/useWorkspaceData';
import { WorkspaceList } from './WorkspaceList';
import './workspace-index.css';

export function Workspace({ view }: { view: 'tests' | 'results' }) {
  const isTests = view === 'tests';
  const data = useWorkspaceData(isTests);
  const { tests, runs, loading, error, setError, latestRuns, running, connected, refresh } = data;
  const submit = useRunSubmission();
  const router = useRouter();
  const params = useSearchParams();
  const [starting, setStarting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState<TestCase | null>(null);
  const [matrixTest, setMatrixTest] = useState<TestCase | null>(null);
  const [matrixError, setMatrixError] = useState('');
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
      url: test?.url ?? '',
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

  return (
    <div className="workspace-index mx-auto max-w-[1500px]">
      <h1 className="sr-only">{isTests ? '测试用例' : '执行记录'}</h1>
      {error && (
        <div
          role="alert"
          className="mt-5 flex items-center justify-between gap-4 border border-error-line bg-error-soft p-3 text-sm text-error-ink"
        >
          <span>{error}</span>
          <Button onClick={() => void refresh()} className="shrink-0 underline">
            重试
          </Button>
        </div>
      )}
      <WorkspaceList
        actions={
          <>
            {!isTests && (
              <Button className="ws-button workspace-index-refresh" onClick={() => void refresh()}>
                刷新
              </Button>
            )}
            {isTests ? (
              <Button className="ws-button primary" onClick={() => openEditor()}>
                <Icon icon={plusIcon} width="16" aria-hidden="true" /> 新建测试
              </Button>
            ) : (
              <Link href="/cases" className="ws-button">
                <Icon icon={testsIcon} width="16" aria-hidden="true" /> 前往测试
              </Link>
            )}
          </>
        }
        query={data.query}
        setQuery={data.setQuery}
        filter={data.filter}
        setFilter={data.setFilter}
        page={data.page}
        hasPrevious={data.hasPrevious}
        hasNext={data.hasNext}
        nextPage={data.nextPage}
        previousPage={data.previousPage}
        isTests={isTests}
        tests={tests}
        runs={runs}
        loading={loading}
        latestRuns={latestRuns}
        running={running}
        connected={connected}
        starting={starting}
        exporting={exporting}
        openEditor={openEditor}
        openMatrix={openMatrix}
        setDeleting={setDeleting}
        start={start}
        exportRun={exportRun}
      />
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
