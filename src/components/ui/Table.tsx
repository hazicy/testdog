'use client';

import { useRender } from '@base-ui/react/use-render';
import { twMerge } from 'tailwind-merge';

export function Table({ render, ref, className, ...props }: useRender.ComponentProps<'table'>) {
  return useRender({
    defaultTagName: 'table',
    render,
    ref,
    props: {
      ...props,
      'data-slot': 'table',
      className: twMerge(
        'w-full border-collapse text-left text-[13px] whitespace-nowrap',
        className,
      ),
    },
  });
}

export function TableHeader({
  render,
  ref,
  className,
  ...props
}: useRender.ComponentProps<'thead'>) {
  return useRender({
    defaultTagName: 'thead',
    render,
    ref,
    props: {
      ...props,
      'data-slot': 'table-header',
      className: twMerge('bg-surface-muted', className),
    },
  });
}

export function TableBody({ render, ref, className, ...props }: useRender.ComponentProps<'tbody'>) {
  return useRender({
    defaultTagName: 'tbody',
    render,
    ref,
    props: {
      ...props,
      'data-slot': 'table-body',
      className: twMerge('[&>tr:last-child]:border-b-0 [&>tr:hover]:bg-surface-hover', className),
    },
  });
}

export function TableRow({ render, ref, className, ...props }: useRender.ComponentProps<'tr'>) {
  return useRender({
    defaultTagName: 'tr',
    render,
    ref,
    props: {
      ...props,
      'data-slot': 'table-row',
      className: twMerge('border-b border-line-subtle', className),
    },
  });
}

export function TableHead({ render, ref, className, ...props }: useRender.ComponentProps<'th'>) {
  return useRender({
    defaultTagName: 'th',
    render,
    ref,
    props: {
      scope: 'col',
      ...props,
      'data-slot': 'table-head',
      className: twMerge(
        'border-b border-page-line px-4.5 py-3 text-xs font-normal text-table-heading',
        className,
      ),
    },
  });
}

export function TableCell({ render, ref, className, ...props }: useRender.ComponentProps<'td'>) {
  return useRender({
    defaultTagName: 'td',
    render,
    ref,
    props: {
      ...props,
      'data-slot': 'table-cell',
      className: twMerge('px-4.5 py-4', className),
    },
  });
}

export function TableCaption({
  render,
  ref,
  className,
  ...props
}: useRender.ComponentProps<'caption'>) {
  return useRender({
    defaultTagName: 'caption',
    render,
    ref,
    props: {
      ...props,
      'data-slot': 'table-caption',
      className: twMerge('caption-bottom mt-4 text-xs text-page-muted', className),
    },
  });
}
