'use client';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Checkbox } from '@/components/ui/Checkbox';
import { useState } from 'react';
import type { BrowserLog } from '@/workspace/types';

export function BrowserLogPanel({
  logs,
  kind,
  elapsedMs,
  stepId,
}: {
  logs: BrowserLog[];
  kind: BrowserLog['kind'];
  elapsedMs?: number;
  stepId?: string;
}) {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState('all');
  const [errors, setErrors] = useState(false);
  const visible = logs
    .filter(
      (log) =>
        log.kind === kind &&
        (scope !== 'step' || (!!stepId && log.stepId === stepId)) &&
        (scope !== 'time' || (elapsedMs != null && log.elapsedMs <= elapsedMs)) &&
        (!errors || log.level === 'error' || !!log.failure || (log.status || 0) >= 400) &&
        `${log.message || ''} ${log.url || ''} ${log.pageId} ${log.level || ''} ${log.status || ''}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) => a.elapsedMs - b.elapsedMs);

  return (
    <section aria-label={kind === 'console' ? 'Console 记录' : 'Network 记录'}>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input
          aria-label="搜索浏览器记录"
          className="ws-input max-w-xs"
          placeholder="搜索内容、URL、状态码…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Select
          aria-label="记录范围"
          className="ws-input w-auto"
          value={scope}
          onValueChange={(value) => setScope(value)}
          items={[
            { value: 'all', label: '全部记录' },
            { value: 'step', label: '当前步骤', disabled: !stepId },
            { value: 'time', label: '截至回放时间', disabled: elapsedMs == null },
          ]}
        />
        <label className="flex gap-2 text-xs">
          <Checkbox checked={errors} onCheckedChange={(checked) => setErrors(checked)} />
          仅错误
        </label>
        <span className="text-xs text-page-muted">{visible.length} 条</span>
      </div>
      <div className="max-h-96 overflow-auto font-mono text-xs">
        {visible.map((log) => (
          <details key={log.id} className="border-b border-page-line py-3">
            <summary className="cursor-pointer break-all leading-6">
              <span className="mr-3 text-page-muted">
                {(log.elapsedMs / 1000).toFixed(2)}s · {log.pageId}
              </span>
              {kind === 'console' ? (
                <span className={log.level === 'error' ? 'text-error-ink' : ''}>
                  [{log.level}] {log.message}
                </span>
              ) : (
                <span className={log.failure || (log.status || 0) >= 400 ? 'text-error-ink' : ''}>
                  {log.method} {log.status ?? (log.failure ? 'FAILED' : '—')} {log.url} ·{' '}
                  {log.durationMs ?? 0}ms
                </span>
              )}
            </summary>
            <pre className="mt-2 whitespace-pre-wrap break-all bg-page p-3 leading-6">
              {JSON.stringify(log, null, 2)}
            </pre>
          </details>
        ))}
        {!visible.length && (
          <p className="py-5 text-page-muted">
            没有符合条件的记录。旧执行记录不包含浏览器日志，请重新录制或重放。
          </p>
        )}
      </div>
      <p className="mt-3 text-xs text-page-muted">
        每次执行最多采集 2000 条浏览器记录；敏感请求头已隐藏。
      </p>
    </section>
  );
}
