'use client';

import { Select as BaseSelect } from '@base-ui/react/select';
import type { ReactNode } from 'react';
import { inputStyles } from './inputStyles';
import { twMerge } from 'tailwind-merge';

type Item = { value: string | number; label: ReactNode; disabled?: boolean };
type Props = {
  items: (Item | Item[] | false | null | undefined)[];
  value: string | number;
  onValueChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  'aria-label'?: string;
};

export function Select({ items, value, onValueChange, className = '', ...props }: Props) {
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
        className={twMerge(
          inputStyles(),
          'inline-flex items-center justify-between gap-3 text-left cursor-pointer',
          className,
        )}
        aria-label={props['aria-label']}
      >
        <BaseSelect.Value />
        <BaseSelect.Icon aria-hidden="true" className="ml-auto text-page-muted">
          ⌄
        </BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner className="z-60" sideOffset={4} alignItemWithTrigger={false}>
          <BaseSelect.Popup className="min-w-(--anchor-width) max-h-[min(320px,var(--available-height))] max-w-(--available-width) overflow-y-auto rounded-md border border-control-line bg-surface p-1 text-[13px] text-ink shadow-[0_8px_24px_var(--shadow)]">
            <BaseSelect.List>
              {options.map((item) => (
                <BaseSelect.Item
                  key={item.value}
                  value={item.value}
                  disabled={item.disabled}
                  className="flex cursor-pointer items-center justify-between gap-4 rounded px-2.5 py-2 data-[highlighted]:bg-brand-soft data-[highlighted]:text-brand-hover data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45 data-[selected]:font-medium"
                >
                  <BaseSelect.ItemText>{item.label}</BaseSelect.ItemText>
                  <BaseSelect.ItemIndicator aria-hidden="true" className="text-brand">
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
