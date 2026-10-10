'use client';

import { useRunSubmission } from '@/client/useRunSubmission';
import { Button } from '@/components/ui/Button';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { TestCase } from '@/features/test-cases/types';
import type { TestRun, RunSummary } from '@/features/runs/types';
import { WorkspaceIcon as Icon } from '@/components/shared/WorkspaceIcon';
import { downloadRunReport } from '@/client/download';
import { TestEditor } from '@/features/test-cases/components/TestEditor';
import { DeleteTestDialog } from '@/features/test-cases/components/DeleteTestDialog';
import { RunMatrixDialog } from '@/features/test-cases/components/RunMatrixDialog';
import { useWorkspaceData } from '../hooks/useWorkspaceData';
import { WorkspaceStats } from './WorkspaceStats';
import { WorkspaceList } from './WorkspaceList';

export function Workspace({ view }: { view: 'tests' | 'results' }) {
  const isTests = view === 'tests';
  const data = useWorkspaceData(isTests);
  const {
    tests,
    runs,
    testCount,
    runCount,
    loading,
    error,
    setError,
    counts,
    latestRuns,
    running,
    connected,
    refresh,
  } = data;
  const submit = useRunSubmission();
  const router = useRouter();
  const params = useSearchParams();
  const [starting, setStarting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [editing, setEditing] = useState<{ test?: TestCase; duplicate?: boolean }>();
  const [deleting, setDeleting] = useState<TestCase | null>(null);
  const [matrixTest, setMatrixTest] = useState<TestCase | null>(null);
  const [matrixError, setMatrixError] = useState('');
  const selectedId = params.get('run');

  useEffect(() => {
    if (selectedId) router.replace(`/runs/${selectedId}`);
  }, [selectedId, router]);

  function openEditor(test?: TestCase, duplicate = false) {
    setEditing({ test, duplicate });
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
    <div className="mx-auto max-w-[1500px]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {isTests ? '测试用例' : '执行记录'}
            <span className="ml-3 rounded-md bg-badge-surface px-2 py-1 align-middle text-xs font-medium text-badge-ink">
              {loading ? '—' : isTests ? testCount : runCount}
            </span>
          </h1>
          <p className="mt-2 text-sm text-text-neutral">
            {isTests
              ? '管理操作步骤与预期结果，运行浏览器测试。'
              : '查看每次测试的真实结果，定位失败并验证修复。'}
          </p>
        </div>
        <div className="flex gap-2">
          {!isTests && (
            <Button className="ws-button" onClick={() => void refresh()}>
              刷新
            </Button>
          )}
          {isTests ? (
            <Button className="ws-button primary" onClick={() => openEditor()}>
              <Icon name="plus" /> 新建测试
            </Button>
          ) : (
            <Link href="/cases" className="ws-button primary">
              <Icon name="tests" /> 前往测试
            </Link>
          )}
        </div>
      </div>
      <WorkspaceStats
        isTests={isTests}
        testCount={testCount}
        runCount={runCount}
        counts={counts}
        running={running}
        loading={loading}
      />
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
      {editing && (
        <TestEditor
          {...editing}
          onClose={() => setEditing(undefined)}
          onSaved={async () => {
            setEditing(undefined);
            await refresh();
          }}
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
