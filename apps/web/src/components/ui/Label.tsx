import styles from './Label.module.css';
import type { ComponentProps } from 'react';
import clsx from 'clsx';

export function Label({ className = '', ...props }: ComponentProps<'label'>) {
  return <label {...props} className={clsx(styles.field, className)} />;
}
