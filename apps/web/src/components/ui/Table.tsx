'use client';

import styles from './Table.module.css';

import { useRender } from '@base-ui/react/use-render';
import { classNames } from '@/components/ui/classNames';

export function Table({ render, ref, className, ...props }: useRender.ComponentProps<'table'>) {
  return useRender({
    defaultTagName: 'table',
    render,
    ref,
    props: {
      ...props,
      'data-slot': 'table',
      className: classNames(styles.table, className),
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
      className: classNames(styles.header, className),
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
      className: classNames(styles.body, className),
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
      className: classNames(styles.row, className),
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
      className: classNames(styles.heading, className),
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
      className: classNames(styles.cell, className),
    },
  });
}
