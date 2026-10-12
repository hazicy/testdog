import { twMerge } from 'tailwind-merge';

const colors: Record<string, string> = {
  passed: 'text-success',
  failed: 'text-danger',
  running: 'text-warning',
  queued: 'text-warning',
  preparing: 'text-warning',
  finalizing: 'text-warning',
  cancelled: 'text-cancelled',
};

export function statusStyles(status = 'none', className = '') {
  return twMerge(
    'inline-flex items-center gap-1.5 rounded-md text-xs whitespace-nowrap [&>span]:size-1.5 [&>span]:rounded-full [&>span]:bg-current',
    colors[status] ?? 'text-status-none',
    className,
  );
}
