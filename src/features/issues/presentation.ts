import type { IssueOccurrence } from './types';

export function relativeTime(value: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 1000));

  if (seconds < 60) return '刚刚';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`;

  return `${Math.floor(seconds / 86400)} 天前`;
}

export function environmentLabel(occurrence?: IssueOccurrence | null) {
  if (!occurrence) return '未关联环境';
  const environment = occurrence.snapshot.environment;
  const name = environment?.name ?? environment?.environment;

  return typeof name === 'string' ? name : (occurrence.snapshot.target?.platform ?? 'web');
}
