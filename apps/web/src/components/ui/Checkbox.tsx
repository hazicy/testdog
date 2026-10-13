'use client';

import styles from './Checkbox.module.css';

import { Checkbox as BaseCheckbox } from '@base-ui/react/checkbox';
import clsx from 'clsx';

export function Checkbox({ className = '', ...props }: BaseCheckbox.Root.Props) {
  return (
    <BaseCheckbox.Root
      className={(state) =>
        clsx(styles.root, typeof className === 'function' ? className(state) : className)
      }
      {...props}
    >
      <BaseCheckbox.Indicator aria-hidden="true" className={styles.indicator}>
        ✓
      </BaseCheckbox.Indicator>
    </BaseCheckbox.Root>
  );
}
