'use client';

import { Button as BaseButton } from '@base-ui/react/button';
import { buttonStyles, type ButtonVariant, type ButtonSize } from '@/components/ui/buttonStyles';

export { buttonStyles } from '@/components/ui/buttonStyles';
export type { ButtonVariant, ButtonSize } from '@/components/ui/buttonStyles';
export type ButtonProps = BaseButton.Props & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({ variant = 'outline', size = 'md', className, ...props }: ButtonProps) {
  return (
    <BaseButton
      {...props}
      className={
        typeof className === 'function'
          ? (state) => buttonStyles({ variant, size, className: className(state) })
          : buttonStyles({ variant, size, className })
      }
    />
  );
}
