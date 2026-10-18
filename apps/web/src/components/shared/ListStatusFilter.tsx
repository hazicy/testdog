'use client';

import { Icon } from '@iconify/react/offline';
import type { ComponentProps } from 'react';
import styles from './ListStatusFilter.module.css';

type StatusOption = {
  value: string;
  label: string;
  icon?: ComponentProps<typeof Icon>['icon'];
  tone?: 'success' | 'danger' | 'warning';
};

export function ListStatusFilter({
  label,
  value,
  options,
  onValueChange,
}: {
  label: string;
  value: string;
  options: StatusOption[];
  onValueChange: (value: string) => void;
}) {
  return (
    <div className={styles.filters} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          type="button"
          key={option.value}
          aria-pressed={value === option.value}
          className={styles.option}
          data-tone={option.tone}
          onClick={() => onValueChange(option.value)}
        >
          {option.icon && <Icon icon={option.icon} width="14" aria-hidden="true" />}
          {option.label}
        </button>
      ))}
    </div>
  );
}
