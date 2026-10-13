import styles from './Label.module.css';
import type { ComponentProps } from 'react';
import { classNames } from '@/components/ui/classNames';

export function Label({ className = '', ...props }: ComponentProps<'label'>) {
  return <label {...props} className={classNames(styles.field, className)} />;
}
