'use client';

import styles from './ModelUsagePanel.module.css';

import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/Table';

import useSWR from 'swr';
import { fetchJson } from '@/client/api';
import type { readModelUsage } from '@testdog/server/runs/modelUsage';
import type { ModelCallMetric } from '@testdog/automation/llm/budget';

export function ModelUsagePanel({ id, active }: { id: string; active: boolean }) {
  const data = useSWR<{
    usage: Awaited<ReturnType<typeof readModelUsage>>;
    calls: (ModelCallMetric & { id: string })[];
  }>(`/api/runs/${id}/model-usage`, fetchJson, { refreshInterval: active ? 5000 : 0 });
  const usage = data.data?.usage;

  return (
    <section aria-label="AI 调用用量" className={styles.section}>
      <p className={styles.description}>AI 调用用量</p>
      {data.error && <p role="alert">无法加载 AI 调用用量。</p>}
      {usage ? (
        <>
          <p className={styles.usageSummary}>
            {usage.calls} 次调用 · {(usage.durationMs / 1000).toFixed(1)}s · 输入{' '}
            {usage.inputTokens} / 输出 {usage.outputTokens} tokens · {usage.failures} 次失败 ·{' '}
            {usage.retries} 次重试
          </p>
          {!!usage.unknownUsage && (
            <p className={styles.usageSummary}>
              {usage.unknownUsage} 次调用未返回用量，token 合计仅包含已知用量。
            </p>
          )}
          <details className={styles.details}>
            <summary className={styles.summary}>查看每次调用</summary>
            <Table className={styles.table}>
              <TableHeader>
                <TableRow>
                  <TableHead>模型 / 时间</TableHead>
                  <TableHead>耗时</TableHead>
                  <TableHead>输入 / 输出</TableHead>
                  <TableHead>状态 / 重试</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.data?.calls.map((call) => (
                  <TableRow key={call.id}>
                    <TableCell>
                      {call.model} · {new Date(call.startedAt).toLocaleTimeString('zh-CN')}
                    </TableCell>
                    <TableCell>{call.durationMs}ms</TableCell>
                    <TableCell>
                      {call.inputTokens ?? '—'} / {call.outputTokens ?? '—'}
                    </TableCell>
                    <TableCell>
                      {call.status} / {call.retryCount}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </details>
        </>
      ) : (
        !data.error && <p className={styles.usageSummary}>正在加载…</p>
      )}
    </section>
  );
}
