import type { ComponentProps } from 'react';
import { inputStyles } from '@/components/ui/inputStyles';

export function Textarea({ className = '', ...props }: ComponentProps<'textarea'>) {
  return <textarea {...props} data-slot="input" className={inputStyles(className)} />;
}
