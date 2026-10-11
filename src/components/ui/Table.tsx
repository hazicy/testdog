import type { ComponentProps } from 'react';
import { twMerge } from 'tailwind-merge';

export function Table({ className = '', ...props }: ComponentProps<'table'>) {
  return (
    <table
      {...props}
      className={twMerge(
        'w-full border-collapse text-left whitespace-nowrap [&_th]:bg-surface-muted [&_th]:px-4.5 [&_th]:py-3 [&_th]:text-[11px] [&_th]:font-medium [&_th]:text-table-heading [&_th]:border-b [&_th]:border-page-line [&_td]:px-4.5 [&_td]:py-4 [&_td]:text-[13px] [&_td]:border-b [&_td]:border-line-subtle [&_tbody_tr:last-child_td]:border-b-0 [&_tbody_tr:hover]:bg-surface-hover',
        className,
      )}
    />
  );
}
