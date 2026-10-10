'use client';

import { isActiveRun } from '@/workspace/types';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { TestCase, TestRun } from '@/workspace/types';
import { WorkspaceIcon as Icon } from './WorkspaceIcon';

const statusLabels = {
  queued: '排队中',
  preparing: '准备中',
  finalizing: '归档中',
  running: '执行中',
  passed: '已通过',
  failed: '失败',
  cancelled: '已停止',
};
function Status({ status }: { status?: TestRun['status'] }) {
  return (
    <span className={`ws-status ${status || 'none'}`}>
      <span />
      {status ? statusLabels[status] : '未运行'}
    </span>
  );
}
function date(value: string) {
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
function duration(run: TestRun) {
  return run.durationMs == null
    ? '—'
    : run.durationMs < 1000
      ? `${run.durationMs} ms`
      : `${(run.durationMs / 1000).toFixed(1)} s`;
}
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || '操作失败，请重试。');
  return data;
}
const json = (body: unknown, method = 'POST'): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export function Workspace({ view }: { view: 'tests' | 'results' }) {
  const router = useRouter();
  const params = useSearchParams();
  const [tests, setTests] = useState<TestCase[]>([]);
  const [runs, setRuns] = useState<TestRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [editing, setEditing] = useState<TestCase | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<TestCase | null>(null);
  const [matrixTest, setMatrixTest] = useState<TestCase | null>(null);
  const [matrixCode, setMatrixCode] = useState('');
  const [matrixError, setMatrixError] = useState('');
  const matrixDialog = useRef<HTMLDialogElement>(null);
  const [formError, setFormError] = useState('');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [platform, setPlatform] = useState<'web' | 'android' | 'ios'>('web');
  const [webProfile, setWebProfile] = useState('Pixel 7');
  const [appId, setAppId] = useState('');
  const [deviceProfileId, setDeviceProfileId] = useState('');
  const [buildArtifactId, setBuildArtifactId] = useState('');
  const [resetPolicy, setResetPolicy] = useState<'preserve' | 'clear-data' | 'reinstall'>(
    'preserve',
  );
  const [launchUrl, setLaunchUrl] = useState('');
  const [nativeVideo, setNativeVideo] = useState(false);
  const [nativeTrace, setNativeTrace] = useState(false);
  const [nativeLogs, setNativeLogs] = useState(false);
  const [inputRefs, setInputRefs] = useState('{}');
  const [builds, setBuilds] = useState<
    { id: string; platform: string; appId: string; sha256: string }[]
  >([]);
  const [deviceResources, setDeviceResources] = useState<
    { id: string; platform: string; profileId: string; status: string }[]
  >([]);
  const [goal, setGoal] = useState('');
  const [tags, setTags] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const deleteDialog = useRef<HTMLDialogElement>(null);
  const selectedId = params.get('run');
  const running = runs.some((run) => isActiveRun(run.status));
  const isTests = view === 'tests';

  const refresh = useCallback(async () => {
    try {
      const [testData, runData] = await Promise.all([
        api<{ tests: TestCase[] }>('/api/tests'),
        api<{ runs: TestRun[] }>('/api/runs'),
      ]);
      setTests(testData.tests);
      setRuns(runData.runs);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法加载工作区');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);
  useEffect(() => {
    const timer = setInterval(
      () => {
        if (document.visibilityState === 'visible') void refresh();
      },
      running ? 2000 : 15000,
    );
    const onFocus = () => {
      void refresh();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh, running]);
  useEffect(() => {
    if (editing !== undefined) dialog.current?.showModal();
    else dialog.current?.close();
  }, [editing]);
  useEffect(() => {
    if (selectedId) router.replace(`/runs/${selectedId}`);
  }, [selectedId, router]);
  useEffect(() => {
    if (deleting) deleteDialog.current?.showModal();
    else deleteDialog.current?.close();
  }, [deleting]);

  function openEditor(test?: TestCase, duplicate = false) {
    setEditing(duplicate || !test ? null : test);
    setName(test ? `${test.name}${duplicate ? '（副本）' : ''}` : '');
    setUrl(test?.url || '');
    setPlatform(test?.target?.platform ?? 'web');
    setWebProfile(
      test?.target?.platform === 'web'
        ? test.target.deviceProfile
        : test
          ? 'legacy-desktop'
          : 'Pixel 7',
    );
    setAppId(test?.target && test.target.platform !== 'web' ? test.target.appId : '');
    setDeviceProfileId(
      test?.target && test.target.platform !== 'web' ? test.target.deviceProfileId : '',
    );
    const native = test?.target && test.target.platform !== 'web' ? test.target : undefined;
    setBuildArtifactId(native?.buildArtifactId || '');
    setResetPolicy(native?.resetPolicy || 'preserve');
    setLaunchUrl(native?.launchUrl || '');
    setNativeVideo(native?.evidence?.video || false);
    setNativeTrace(native?.evidence?.trace || false);
    setNativeLogs(native?.evidence?.logs || false);
    setInputRefs(JSON.stringify(test?.target?.inputs || {}, null, 2));
    void api<{ builds: typeof builds }>('/api/builds')
      .then((data) => setBuilds(data.builds))
      .catch(() => {});
    void api<{ resources: typeof deviceResources }>('/api/resources')
      .then((data) => setDeviceResources(data.resources))
      .catch(() => {});
    setGoal(test?.goal || '');
    setTags(test?.tags.join(', ') || '');
    setFormError('');
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      await api(
        editing ? `/api/tests/${editing.id}` : '/api/tests',
        json(
          {
            name,
            ...(platform === 'web'
              ? {
                  url: url.trim(),
                  target: {
                    schemaVersion: 1,
                    platform,
                    url: url.trim(),
                    browser: webProfile === 'iPhone 13' ? 'webkit' : 'chromium',
                    deviceProfile: webProfile,
                    inputs: JSON.parse(inputRefs),
                  },
                }
              : {
                  target: {
                    schemaVersion: 1,
                    platform,
                    appId,
                    deviceProfileId,
                    inputs: JSON.parse(inputRefs),
                    resetPolicy,
                    evidence: { video: nativeVideo, trace: nativeTrace, logs: nativeLogs },
                    ...(buildArtifactId ? { buildArtifactId } : {}),
                    ...(launchUrl.trim() ? { launchUrl: launchUrl.trim() } : {}),
                  },
                }),
            goal,
            tags: tags
              .split(/[,，]/)
              .map((tag) => tag.trim())
              .filter(Boolean),
          },
          editing ? 'PATCH' : 'POST',
        ),
      );
      setEditing(undefined);
      await refresh();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }
  async function start(testId: string) {
    setStarting(true);
    setError('');
    try {
      const { run } = await api<{ run: TestRun }>('/api/runs', json({ testId }));
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
    const target = test.target || {
      schemaVersion: 1,
      platform: 'web',
      url: test.url,
      browser: 'chromium',
      deviceProfile: 'legacy-desktop',
    };
    setMatrixCode(JSON.stringify([{ target, goal: test.goal }], null, 2));
    matrixDialog.current?.showModal();
  }
  async function startMatrix(event: React.FormEvent) {
    event.preventDefault();
    if (!matrixTest) return;
    setStarting(true);
    setMatrixError('');
    try {
      await api(
        '/api/run-batches',
        json({ testId: matrixTest.id, variants: JSON.parse(matrixCode) }),
      );
      matrixDialog.current?.close();
      setMatrixTest(null);
      router.push('/runs');
      await refresh();
    } catch (cause) {
      setMatrixError(cause instanceof Error ? cause.message : '矩阵启动失败');
    } finally {
      setStarting(false);
    }
  }
  async function remove() {
    if (!deleting) return;
    setSaving(true);
    try {
      await api(`/api/tests/${deleting.id}`, { method: 'DELETE' });
      setDeleting(null);
      await refresh();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : '删除失败');
    } finally {
      setSaving(false);
    }
  }
  function exportRun(run: TestRun) {
    const report = run;
    const href = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = href;
    link.download = `caseforge-${run.id}.json`;
    link.click();
    URL.revokeObjectURL(href);
  }
  const latest = (id: string) => runs.find((run) => run.testId === id);
  const visibleTests = tests.filter(
    (test) =>
      `${test.name} ${test.target && test.target.platform !== 'web' ? `${test.target.platform} · ${test.target.appId}` : test.url} ${test.target?.platform} ${test.target && test.target.platform !== 'web' ? test.target.appId : ''} ${test.tags.join(' ')}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (filter === 'all' || (latest(test.id)?.status || 'none') === filter),
  );
  const visibleRuns = runs.filter(
    (run) =>
      `${run.name} ${run.url}`.toLowerCase().includes(query.toLowerCase()) &&
      (filter === 'all' || run.status === filter),
  );
  const passed = runs.filter((run) => run.status === 'passed').length;
  const finished = runs.filter((run) => run.status === 'passed' || run.status === 'failed').length;

  return (
    <div className="mx-auto max-w-[1500px]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 font-mono text-[10px] tracking-[1.5px] text-[#929292]">
            {isTests ? '01 / TEST LIBRARY' : '02 / EXECUTION HISTORY'}
          </p>
          <h1 className="text-[30px] font-[550] tracking-[-1px] sm:text-[34px]">
            {isTests ? '把想法，变成测试。' : '每一次执行，都有据可查。'}{' '}
            <span className="ml-2 align-middle text-xs font-normal text-[#858578]">
              {isTests ? tests.length : runs.length}
            </span>
          </h1>
          <p className="mt-2 text-sm text-[#737373]">
            {isTests
              ? '用自然语言定义用户路径，让每一次发布更有把握。'
              : '查看每次测试的真实结果，定位失败并验证修复。'}
          </p>
        </div>
        <div className="flex gap-2">
          {!isTests && (
            <button className="ws-button" onClick={() => void refresh()}>
              刷新
            </button>
          )}
          {isTests ? (
            <button className="ws-button primary" onClick={() => openEditor()}>
              <Icon name="plus" /> 新建测试
            </button>
          ) : (
            <Link href="/cases" className="ws-button primary">
              <Icon name="tests" /> 前往测试
            </Link>
          )}
        </div>
      </div>
      <div className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          {
            label: isTests ? '测试用例' : '总执行次数',
            value: isTests ? tests.length : runs.length,
            note: isTests ? '保存的测试场景' : '全部历史记录',
          },
          {
            label: '通过率',
            value: finished ? `${Math.round((passed / finished) * 100)}%` : '—',
            note: '已完成的执行',
          },
          {
            label: '失败记录',
            value: runs.filter((run) => run.status === 'failed').length,
            note: '需要关注的执行',
          },
          {
            label: '执行中',
            value: runs.filter((run) => isActiveRun(run.status)).length,
            note: running ? '结果自动更新' : '等待下一次测试',
          },
        ].map((stat) => (
          <div key={stat.label} className="border border-[#e2e1da] bg-[#fffefa] px-5 py-4">
            <p className="text-xs text-[#78796f]">{stat.label}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{stat.value}</p>
            <p className="mt-1 text-[11px] text-[#98998b]">{stat.note}</p>
          </div>
        ))}
      </div>
      {error && (
        <div
          role="alert"
          className="mt-5 flex items-center justify-between gap-4 border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          <span>{error}</span>
          <button onClick={() => void refresh()} className="shrink-0 underline">
            重试
          </button>
        </div>
      )}
      <section
        className="mt-6 border border-[#e2e1da] bg-[#fffefa]"
        aria-label={isTests ? '测试用例列表' : '执行记录列表'}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e2e1da] p-4">
          <div className="relative w-full sm:w-80">
            <Icon name="search" className="absolute top-2.5 left-3 text-[#858578]" width="16" />
            <input
              aria-label={isTests ? '搜索测试' : '搜索结果'}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={isTests ? '搜索名称、地址或标签…' : '搜索测试名称或地址…'}
              className="ws-input pl-9"
            />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-[#858578]">状态</span>
            <select
              aria-label="状态筛选"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              className="ws-input w-auto"
            >
              <option value="all">全部状态</option>
              <option value="passed">已通过</option>
              <option value="failed">失败</option>
              <option value="queued">排队中</option>
              <option value="preparing">准备中</option>
              <option value="running">执行中</option>
              <option value="finalizing">归档中</option>
              <option value="cancelled">已停止</option>
              {isTests && <option value="none">未运行</option>}
            </select>
          </div>
        </div>
        {loading ? (
          <p role="status" className="p-16 text-center text-sm text-[#858578]">
            正在加载工作区…
          </p>
        ) : (isTests ? visibleTests.length === 0 : visibleRuns.length === 0) ? (
          <div className="flex flex-col items-center px-5 py-18 text-center">
            <span className="mb-5 grid h-14 w-14 place-items-center border border-[#e2e1da] bg-[#f5f4ee] text-[#a3a3a3]">
              <Icon name={isTests ? 'tests' : 'results'} width="27" height="27" />
            </span>
            <h2 className="text-base font-medium">
              {query || filter !== 'all'
                ? '没有符合条件的记录'
                : isTests
                  ? '准备好你的第一个测试'
                  : '测试结果会出现在这里'}
            </h2>
            <p className="mt-2 max-w-90 text-sm leading-6 text-[#858578]">
              {query || filter !== 'all'
                ? '试试其他关键词，或清除状态筛选。'
                : isTests
                  ? '添加网站地址、操作步骤和预期结果。无需编写脚本，就能开始一次浏览器测试。'
                  : '从 Tests 页面运行一个用例，查看执行状态、耗时与详细日志。'}
            </p>
            {query || filter !== 'all' ? (
              <button
                className="ws-button mt-6"
                onClick={() => {
                  setQuery('');
                  setFilter('all');
                }}
              >
                清除筛选
              </button>
            ) : isTests ? (
              <button className="ws-button primary mt-6" onClick={() => openEditor()}>
                <Icon name="plus" /> 新建测试
              </button>
            ) : (
              <Link href="/cases" className="ws-button mt-6">
                浏览测试 <Icon name="chevron" width="14" />
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="ws-table">
              <thead>
                <tr>
                  <th>{isTests ? '测试名称' : '执行 / 测试名称'}</th>
                  <th>{isTests ? '最近状态' : '状态'}</th>
                  <th>{isTests ? '更新时间' : '开始时间'}</th>
                  <th>{isTests ? '最近执行' : '耗时'}</th>
                  <th className="text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {isTests
                  ? visibleTests.map((test) => {
                      const run = latest(test.id);
                      return (
                        <tr key={test.id}>
                          <td>
                            <button
                              onClick={() => openEditor(test)}
                              className="text-left font-medium hover:text-[#cf4f2e]"
                            >
                              {test.name}
                            </button>
                            <p className="mt-1 max-w-96 truncate text-xs text-[#98998b]">
                              {test.target && test.target.platform !== 'web'
                                ? `${test.target.platform} · ${test.target.appId}`
                                : test.url}
                            </p>
                            {test.tags.length > 0 && (
                              <div className="mt-2 flex gap-1">
                                {test.tags.map((tag, index) => (
                                  <span
                                    key={`${tag}-${index}`}
                                    className="border border-[#e2e1da] px-1.5 py-0.5 text-[10px] text-[#78796f]"
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td>
                            <Status status={run?.status} />
                          </td>
                          <td className="text-xs text-[#78796f]">{date(test.updatedAt)}</td>
                          <td>
                            {run ? (
                              <Link
                                href={`/runs/${run.id}`}
                                className="text-xs text-[#78796f] hover:underline"
                              >
                                {date(run.startedAt)} ↗
                              </Link>
                            ) : (
                              <span className="text-[#aaa]">—</span>
                            )}
                          </td>
                          <td>
                            <div className="flex justify-end gap-1">
                              <button
                                className="ws-button mr-2"
                                disabled={starting}
                                onClick={() => void start(test.id)}
                              >
                                <Icon name="results" width="14" /> 运行
                              </button>
                              <button
                                className="ws-button"
                                disabled={starting}
                                onClick={() => openMatrix(test)}
                              >
                                矩阵
                              </button>
                              <button
                                className="ws-icon-button"
                                aria-label={`编辑 ${test.name}`}
                                title="编辑"
                                onClick={() => openEditor(test)}
                              >
                                <Icon name="edit" width="16" />
                              </button>
                              <button
                                className="ws-icon-button"
                                aria-label={`复制 ${test.name}`}
                                title="复制"
                                onClick={() => openEditor(test, true)}
                              >
                                <Icon name="copy" width="16" />
                              </button>
                              <button
                                className="ws-icon-button"
                                aria-label={`删除 ${test.name}`}
                                title="删除"
                                onClick={() => {
                                  setFormError('');
                                  setDeleting(test);
                                }}
                              >
                                <Icon name="trash" width="16" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  : visibleRuns.map((run) => (
                      <tr key={run.id}>
                        <td>
                          <Link
                            href={`/runs/${run.id}`}
                            className="font-medium hover:text-[#cf4f2e]"
                          >
                            {run.name}
                          </Link>
                          <p className="mt-1 font-mono text-[10px] text-[#98998b]">
                            #{run.id.slice(0, 8)} · {run.url}
                          </p>
                        </td>
                        <td>
                          <Status status={run.status} />
                        </td>
                        <td className="text-xs text-[#78796f]">{date(run.startedAt)}</td>
                        <td className="font-mono text-xs text-[#78796f]">{duration(run)}</td>
                        <td>
                          <div className="flex justify-end gap-2">
                            <Link href={`/runs/${run.id}`} className="ws-button">
                              查看详情 <Icon name="chevron" width="13" />
                            </Link>
                            <button
                              className="ws-icon-button"
                              title="导出结果"
                              aria-label={`导出 ${run.name} 的结果`}
                              onClick={() => exportRun(run)}
                            >
                              <Icon name="download" width="16" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-[#e2e1da] px-4 py-3 text-[11px] text-[#98998b]">
          <span>{isTests ? visibleTests.length : visibleRuns.length} 条记录</span>
          <span className="flex items-center gap-1.5">
            <span
              className={`h-1.5 w-1.5 rounded-full ${running ? 'bg-[#f16b43]' : 'bg-[#8da58c]'}`}
            />
            {running ? '执行中 · 每 2 秒更新' : '执行记录持久保存'}
          </span>
        </div>
      </section>
      <dialog
        ref={dialog}
        className="ws-dialog"
        onCancel={(event) => {
          if (saving) event.preventDefault();
          else setEditing(undefined);
        }}
        onClose={() => setEditing(undefined)}
        aria-labelledby="editor-title"
      >
        <form onSubmit={(event) => void save(event)}>
          <div className="ws-dialog-header">
            <div>
              <h2 id="editor-title" className="text-lg font-semibold">
                {editing ? '编辑测试' : '新建测试'}
              </h2>
              <p className="mt-1 text-xs text-[#858578]">描述操作与预期结果，由 AI 规划执行。</p>
            </div>
            <button
              type="button"
              className="ws-icon-button"
              disabled={saving}
              aria-label="关闭编辑器"
              onClick={() => setEditing(undefined)}
            >
              <Icon name="close" />
            </button>
          </div>
          <div className="space-y-5 p-6">
            <label className="ws-label">
              测试名称
              <input
                className="ws-input"
                required
                maxLength={120}
                value={name}
                disabled={saving}
                onChange={(event) => setName(event.target.value)}
                placeholder="例如：验证登录页面"
              />
            </label>
            <label className="ws-label">
              平台
              <select
                className="ws-input"
                aria-label="平台"
                value={platform}
                disabled={saving}
                onChange={(event) => setPlatform(event.target.value as typeof platform)}
              >
                <option value="web">Web · 移动浏览器</option>
                <option value="android">Android · 原生应用</option>
                <option value="ios">iOS · 原生应用</option>
              </select>
            </label>
            {platform === 'web' ? (
              <>
                <label className="ws-label">
                  网站地址
                  <input
                    className="ws-input"
                    required
                    type="url"
                    value={url}
                    disabled={saving}
                    onChange={(event) => setUrl(event.target.value)}
                    placeholder="https://your-app.com"
                  />
                </label>
                <label className="ws-label">
                  浏览器与设备
                  <select
                    className="ws-input"
                    aria-label="浏览器与设备"
                    value={webProfile}
                    disabled={saving}
                    onChange={(event) => setWebProfile(event.target.value)}
                  >
                    <option value="Pixel 7">Pixel 7 · Chromium</option>
                    <option value="iPhone 13">iPhone 13 · WebKit</option>
                    {webProfile === 'legacy-desktop' && (
                      <option value="legacy-desktop">历史桌面 Chromium</option>
                    )}
                  </select>
                </label>
              </>
            ) : (
              <>
                <label className="ws-label">
                  应用标识
                  <input
                    className="ws-input"
                    required
                    value={appId}
                    disabled={saving}
                    onChange={(event) => setAppId(event.target.value)}
                    placeholder="com.example.app"
                  />
                </label>
                <label className="ws-label">
                  设备配置
                  <select
                    className="ws-input"
                    required
                    aria-label="设备配置"
                    value={deviceProfileId}
                    disabled={saving}
                    onChange={(event) => setDeviceProfileId(event.target.value)}
                  >
                    <option value="">选择已登记的设备配置</option>
                    {deviceResources
                      .filter((resource) => resource.platform === platform)
                      .map((resource) => (
                        <option key={resource.id} value={resource.profileId}>
                          {resource.profileId} ·{' '}
                          {resource.status === 'quarantined'
                            ? '隔离中'
                            : resource.status === 'busy'
                              ? '使用中'
                              : '可用'}
                        </option>
                      ))}
                    {deviceProfileId &&
                      !deviceResources.some(
                        (resource) =>
                          resource.profileId === deviceProfileId && resource.platform === platform,
                      ) && <option value={deviceProfileId}>{deviceProfileId} · 未连接</option>}
                  </select>
                </label>
                <label className="ws-label">
                  应用构建
                  <select
                    className="ws-input"
                    aria-label="应用构建"
                    value={buildArtifactId}
                    disabled={saving}
                    onChange={(event) => setBuildArtifactId(event.target.value)}
                  >
                    <option value="">使用设备上已安装的应用</option>
                    {builds
                      .filter((build) => build.platform === platform && build.appId === appId)
                      .map((build) => (
                        <option key={build.id} value={build.id}>
                          {build.appId} · {build.sha256.slice(0, 12)}
                        </option>
                      ))}
                    {buildArtifactId && !builds.some((build) => build.id === buildArtifactId) && (
                      <option value={buildArtifactId}>{buildArtifactId} · 不可用</option>
                    )}
                  </select>
                </label>
                <label className="ws-label">
                  初始化策略
                  <select
                    className="ws-input"
                    aria-label="初始化策略"
                    value={resetPolicy}
                    disabled={saving}
                    onChange={(event) => setResetPolicy(event.target.value as typeof resetPolicy)}
                  >
                    <option value="preserve">保留应用数据</option>
                    <option value="clear-data">清除应用数据</option>
                    <option value="reinstall">重新安装所选构建</option>
                  </select>
                </label>
                <fieldset className="space-y-2 text-xs text-page-muted">
                  <legend className="mb-2">诊断附件</legend>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={nativeVideo}
                      disabled={saving}
                      onChange={(event) => setNativeVideo(event.target.checked)}
                    />{' '}
                    视频
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={nativeTrace}
                      disabled={saving}
                      onChange={(event) => setNativeTrace(event.target.checked)}
                    />{' '}
                    设备 trace
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={nativeLogs}
                      disabled={saving}
                      onChange={(event) => setNativeLogs(event.target.checked)}
                    />{' '}
                    应用日志
                  </label>
                </fieldset>
                <label className="ws-label">
                  启动链接（可选）
                  <input
                    className="ws-input"
                    value={launchUrl}
                    disabled={saving}
                    onChange={(event) => setLaunchUrl(event.target.value)}
                    placeholder="myapp://login"
                  />
                </label>
                <p className="text-xs text-page-muted">
                  设备繁忙时会排队。重新安装及 iOS 清除数据需要选择应用构建。
                </p>
              </>
            )}
            <label className="ws-label">
              输入引用（JSON，可选）
              <textarea
                className="ws-input min-h-24 font-mono text-xs"
                aria-label="输入引用（JSON，可选）"
                value={inputRefs}
                disabled={saving}
                onChange={(event) => setInputRefs(event.target.value)}
              />
              <span className="text-xs text-page-muted">
                步骤中用 {'${input.name}'} 引用输入。普通输入：{'{"name":{"value":"Ada"}}'}；密码：
                {'{"password":{"secretRef":"LOGIN_PASSWORD"}}'}。密钥由 worker 配置。
              </span>
            </label>
            <label className="ws-label">
              测试步骤与预期结果
              <textarea
                className="ws-input min-h-48 resize-y leading-6"
                required
                maxLength={20000}
                aria-label="测试步骤与预期结果"
                value={goal}
                disabled={saving}
                onChange={(event) => setGoal(event.target.value)}
                placeholder={
                  '1. 打开网站首页\n2. 点击登录按钮\n3. 验证页面包含邮箱输入框和提交按钮'
                }
              />
            </label>
            <p className="text-xs leading-5 text-[#858578]">
              测试会实际操作目标网站。建议使用测试环境，并写明判断通过的条件。
            </p>
            <label className="ws-label">
              标签 <span className="font-normal text-[#98998b]">（可选，逗号分隔）</span>
              <input
                className="ws-input"
                value={tags}
                disabled={saving}
                onChange={(event) => setTags(event.target.value)}
                placeholder="冒烟测试, 登录"
              />
            </label>
            {formError && (
              <p role="alert" className="text-sm text-red-700">
                {formError}
              </p>
            )}
          </div>
          <div className="ws-dialog-footer">
            <button
              type="button"
              disabled={saving}
              className="ws-button"
              onClick={() => setEditing(undefined)}
            >
              取消
            </button>
            <button type="submit" disabled={saving} className="ws-button primary">
              {saving ? '保存中…' : '保存测试'}
            </button>
          </div>
        </form>
      </dialog>
      <dialog
        ref={matrixDialog}
        className="ws-dialog"
        aria-labelledby="matrix-title"
        onCancel={(event) => {
          if (starting) event.preventDefault();
        }}
        onClose={() => setMatrixTest(null)}
      >
        <form onSubmit={(event) => void startMatrix(event)}>
          <div className="ws-dialog-header">
            <h2 id="matrix-title" className="text-lg font-semibold">
              平台矩阵 · {matrixTest?.name}
            </h2>
          </div>
          <div className="space-y-4 p-6">
            <p className="text-sm text-page-muted">
              填写 1–10 个运行配置。每项包含 target，可用 goal
              覆盖该平台的步骤与预期。所有运行一起创建，各自排队。
            </p>
            <label className="ws-label">
              运行配置（JSON）
              <textarea
                className="ws-input min-h-72 font-mono text-xs"
                required
                aria-label="运行配置（JSON）"
                value={matrixCode}
                disabled={starting}
                onChange={(event) => setMatrixCode(event.target.value)}
              />
            </label>
            <details className="text-xs text-page-muted">
              <summary>平台配置示例</summary>
              <pre className="mt-2 overflow-auto">
                {JSON.stringify(
                  [
                    {
                      target: {
                        platform: 'web',
                        url: 'https://example.com',
                        browser: 'chromium',
                        deviceProfile: 'Pixel 7',
                      },
                    },
                    {
                      target: {
                        platform: 'android',
                        appId: 'com.example.app',
                        deviceProfileId: 'android-phone',
                        resetPolicy: 'preserve',
                      },
                    },
                    {
                      target: {
                        platform: 'ios',
                        appId: 'com.example.app',
                        deviceProfileId: 'iphone-simulator',
                        resetPolicy: 'preserve',
                      },
                    },
                  ],
                  null,
                  2,
                )}
              </pre>
            </details>
            {matrixError && (
              <p role="alert" className="text-sm text-red-700">
                {matrixError}
              </p>
            )}
          </div>
          <div className="ws-dialog-footer">
            <button
              type="button"
              className="ws-button"
              disabled={starting}
              onClick={() => matrixDialog.current?.close()}
            >
              取消
            </button>
            <button type="submit" className="ws-button primary" disabled={starting}>
              {starting ? '创建中…' : '运行矩阵'}
            </button>
          </div>
        </form>
      </dialog>
      <dialog
        ref={deleteDialog}
        className="ws-dialog max-w-md"
        aria-labelledby="delete-title"
        onCancel={(event) => {
          if (saving) event.preventDefault();
          else setDeleting(null);
        }}
        onClose={() => setDeleting(null)}
      >
        <div className="p-6">
          <h2 id="delete-title" className="text-lg font-semibold">
            删除测试？
          </h2>
          <p className="mt-3 text-sm leading-6 text-[#78796f]">
            将删除「{deleting?.name}」。历史执行结果会保留。
          </p>
          {formError && (
            <p role="alert" className="mt-3 text-sm text-red-700">
              {formError}
            </p>
          )}
        </div>
        <div className="ws-dialog-footer">
          <button disabled={saving} className="ws-button" onClick={() => setDeleting(null)}>
            取消
          </button>
          <button
            disabled={saving}
            className="ws-button border-red-200 text-red-700"
            onClick={() => void remove()}
          >
            {saving ? '删除中…' : '删除测试'}
          </button>
        </div>
      </dialog>
    </div>
  );
}
