import type { ComponentProps } from 'react';
import { twMerge } from 'tailwind-merge';

export function Label({ className = '', ...props }: ComponentProps<'label'>) {
  return (
    <label
      {...props}
      className={twMerge(
        'block text-[13px] font-medium [&>[data-slot=input]]:mt-2 [&>[data-slot=select]]:mt-2',
        className,
      )}
    />
  );
}
