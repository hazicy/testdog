import type { ComponentProps } from 'react';
import clsx from 'clsx';
import styles from './StatusBadge.module.css';

export function StatusBadge({
  tone = 'neutral',
  className,
  ...props
}: ComponentProps<'span'> & {
  tone?: 'neutral' | 'success' | 'danger' | 'warning';
}) {
  return (
    <span
      {...props}
      data-slot="status"
      data-tone={tone}
      className={clsx(styles.badge, styles[tone], className)}
    />
  );
}
