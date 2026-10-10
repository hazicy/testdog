'use client';

import useSWR from 'swr';
import { fetchJson } from '@/client/api';
import type { readModelUsage } from '@/server/runs/modelUsage';
import type { ModelCallMetric } from '@/automation/llm/budget';

export function ModelUsagePanel({ id, active }: { id: string; active: boolean }) {
  const data = useSWR<{
    usage: Awaited<ReturnType<typeof readModelUsage>>;
    calls: (ModelCallMetric & { id: string })[];
  }>(`/api/runs/${id}/model-usage`, fetchJson, { refreshInterval: active ? 5000 : 0 });
  const usage = data.data?.usage;

  return (
    <section aria-label="AI 调用用量" className="mb-5 border-b border-page-line pb-5 text-xs">
      <p className="font-medium">AI 调用用量</p>
      {data.error && <p role="alert">无法加载 AI 调用用量。</p>}
      {usage ? (
        <>
          <p className="mt-2 text-page-muted">
            {usage.calls} 次调用 · {(usage.durationMs / 1000).toFixed(1)}s · 输入{' '}
            {usage.inputTokens} / 输出 {usage.outputTokens} tokens · {usage.failures} 次失败 ·{' '}
            {usage.retries} 次重试
          </p>
          {!!usage.unknownUsage && (
            <p className="mt-2 text-page-muted">
              {usage.unknownUsage} 次调用未返回用量，token 合计仅包含已知用量。
            </p>
          )}
          <details className="mt-3">
            <summary className="cursor-pointer">查看每次调用</summary>
            <table className="mt-2 w-full text-left">
              <thead>
                <tr>
                  <th>模型 / 时间</th>
                  <th>耗时</th>
                  <th>输入 / 输出</th>
                  <th>状态 / 重试</th>
                </tr>
              </thead>
              <tbody>
                {data.data?.calls.map((call) => (
                  <tr key={call.id}>
                    <td>
                      {call.model} · {new Date(call.startedAt).toLocaleTimeString('zh-CN')}
                    </td>
                    <td>{call.durationMs}ms</td>
                    <td>
                      {call.inputTokens ?? '—'} / {call.outputTokens ?? '—'}
                    </td>
                    <td>
                      {call.status} / {call.retryCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      ) : (
        !data.error && <p className="mt-2 text-page-muted">正在加载…</p>
      )}
    </section>
  );
}
