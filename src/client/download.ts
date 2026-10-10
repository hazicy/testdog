import { api } from './api';
import type { TestRun } from '@/features/runs/types';

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
  const { run } = await api.get(`/api/runs/${id}?include=logs`).json<{ run: TestRun }>();

  downloadText(JSON.stringify(run, null, 2), `testdog-${id}.json`, 'application/json');
}
