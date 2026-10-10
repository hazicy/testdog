'use client';

import { Checkbox as BaseCheckbox } from '@base-ui/react/checkbox';

export function Checkbox({ className = '', ...props }: BaseCheckbox.Root.Props) {
  return (
    <BaseCheckbox.Root
      className={(state) =>
        `ws-checkbox ${typeof className === 'function' ? className(state) : className}`
      }
      {...props}
    >
      <BaseCheckbox.Indicator aria-hidden="true" className="ws-checkbox-indicator">
        ✓
      </BaseCheckbox.Indicator>
    </BaseCheckbox.Root>
  );
}
