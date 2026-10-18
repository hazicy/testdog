import type { ComponentProps } from 'react';
import clsx from 'clsx';
import { Icon } from '@iconify/react/offline';
import searchIcon from '@iconify-icons/lucide/search';
import { Input } from '@/components/ui/Input';
import styles from './SearchInput.module.css';

export function SearchInput({
  className,
  ...props
}: Omit<ComponentProps<typeof Input>, 'className'> & { className?: string }) {
  return (
    <div className={clsx(styles.field, className)}>
      <Icon icon={searchIcon} className={styles.icon} width="16" aria-hidden="true" />
      <Input {...props} className={styles.input} />
    </div>
  );
}
