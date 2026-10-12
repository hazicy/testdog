import { api } from '@/client/api';
import type { BrowserLog, BrowserLogPage, TestRun } from '@testdog/contracts/runs/types';

export function downloadText(content: string, filename: string, type: string) {
  const href = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');

  link.href = href;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // Give the browser time to begin consuming the blob before releasing it.
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

export async function downloadRunReport(id: string) {
  const { run } = await api.get(`/api/runs/${id}`).json<{ run: TestRun }>();

  const browserLogs: BrowserLog[] = [];
  let cursor: string | null = null;

  do {
    const params = new URLSearchParams({ kind: 'all', limit: '100' });

    if (cursor) params.set('cursor', cursor);
    const page = await api.get(`/api/runs/${id}/logs?${params}`).json<BrowserLogPage>();

    browserLogs.push(...page.logs);
    cursor = page.nextCursor;
  } while (cursor);

  downloadText(
    JSON.stringify({ ...run, browserLogs }, null, 2),
    `testdog-${id}.json`,
    'application/json',
  );
}
