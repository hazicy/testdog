'use client';

import styles from './Select.module.css';

import { Select as BaseSelect } from '@base-ui/react/select';
import type { ComponentProps, ReactNode } from 'react';
import { inputStyles } from '@/components/ui/inputStyles';
import clsx from 'clsx';
import { Icon } from '@iconify/react/offline';
import chevronDownIcon from '@iconify-icons/lucide/chevron-down';

type Item = { value: string | number; label: ReactNode; disabled?: boolean };
type Props = {
  items: (Item | Item[] | false | null | undefined)[];
  value: string | number;
  onValueChange: (value: string) => void;
  className?: string;
  triggerIcon?: ComponentProps<typeof Icon>['icon'];
  disabled?: boolean;
  required?: boolean;
  name?: string;
  'aria-label'?: string;
};

export function Select({
  items,
  value,
  onValueChange,
  className = '',
  triggerIcon,
  ...props
}: Props) {
  const options = items
    .flat()
    .filter((item): item is Item => !!item)
    .map((item) => ({ ...item, value: String(item.value) }));

  return (
    <BaseSelect.Root
      items={options}
      value={String(value)}
      onValueChange={(next) => {
        if (next !== null) onValueChange(String(next));
      }}
      disabled={props.disabled}
      required={props.required}
      name={props.name}
    >
      <BaseSelect.Trigger
        data-slot="select"
        className={clsx(inputStyles(), styles.select, className)}
        aria-label={props['aria-label']}
      >
        {triggerIcon ? (
          <Icon icon={triggerIcon} width="18" height="18" aria-hidden="true" />
        ) : (
          <>
            <BaseSelect.Value />
            <BaseSelect.Icon aria-hidden="true" className={styles.icon}>
              <Icon icon={chevronDownIcon} width="16" height="16" />
            </BaseSelect.Icon>
          </>
        )}
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner
          className={styles.positioner}
          sideOffset={4}
          alignItemWithTrigger={false}
        >
          <BaseSelect.Popup className={styles.popup}>
            <BaseSelect.List>
              {options.map((item) => (
                <BaseSelect.Item
                  key={item.value}
                  value={item.value}
                  disabled={item.disabled}
                  className={styles.item}
                >
                  <BaseSelect.ItemText>{item.label}</BaseSelect.ItemText>
                  <BaseSelect.ItemIndicator aria-hidden="true" className={styles.itemIndicator}>
                    ✓
                  </BaseSelect.ItemIndicator>
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}
