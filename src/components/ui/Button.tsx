'use client';
import { Button as BaseButton } from '@base-ui/react/button';

export function Button({ className = 'ws-button', ...props }: BaseButton.Props) {
  return <BaseButton className={className} {...props} />;
}
