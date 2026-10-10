'use client';
import { Input as BaseInput } from '@base-ui/react/input';

export function Input({ className = 'ws-input', ...props }: BaseInput.Props) {
  return <BaseInput className={className} {...props} />;
}
