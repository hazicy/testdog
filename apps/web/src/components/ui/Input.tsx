'use client';

import { Input as BaseInput } from '@base-ui/react/input';
import { inputStyles } from '@/components/ui/inputStyles';

export function Input({ className = '', ...props }: BaseInput.Props) {
  return (
    <BaseInput
      {...props}
      data-slot="input"
      className={
        typeof className === 'function'
          ? (state) => inputStyles(className(state))
          : inputStyles(className)
      }
    />
  );
}
