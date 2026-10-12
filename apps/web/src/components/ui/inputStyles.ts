import { twMerge } from 'tailwind-merge';

export function inputStyles(className = '') {
  return twMerge(
    'block w-full min-h-9.5 rounded-md border border-control-line bg-surface px-[11px] py-[9px] text-[13px] leading-normal font-normal text-control-ink placeholder:text-control-placeholder focus:border-brand focus:outline-2 focus:outline-brand focus:outline-offset-0 disabled:bg-surface-disabled data-[disabled]:bg-surface-disabled',
    className,
  );
}
