'use client';

import { Checkbox as BaseCheckbox } from '@base-ui/react/checkbox';
import { twMerge } from 'tailwind-merge';

export function Checkbox({ className = '', ...props }: BaseCheckbox.Root.Props) {
  return (
    <BaseCheckbox.Root
      className={(state) =>
        twMerge(
          'inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-[3px] border border-control-line bg-surface data-[checked]:border-brand data-[checked]:bg-brand data-[checked]:text-brand-foreground data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45',
          typeof className === 'function' ? className(state) : className,
        )
      }
      {...props}
    >
      <BaseCheckbox.Indicator aria-hidden="true" className="text-xs leading-none">
        ✓
      </BaseCheckbox.Indicator>
    </BaseCheckbox.Root>
  );
}
