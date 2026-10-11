import { twMerge } from 'tailwind-merge';

export type ButtonVariant = 'outline' | 'primary' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'sm' | 'xs' | 'icon' | 'icon-sm' | 'icon-xs';

const base =
  'inline-flex shrink-0 items-center justify-center rounded-md border font-medium whitespace-nowrap transition-colors duration-200 cursor-pointer disabled:cursor-not-allowed disabled:opacity-45 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45 focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2 aria-pressed:border-brand-line aria-pressed:bg-brand-soft aria-pressed:text-brand-hover';
const variants: Record<ButtonVariant, string> = {
  outline:
    'border-control-line bg-surface text-control-ink [&:hover:not(:disabled):not([data-disabled])]:bg-control-hover',
  primary:
    'border-brand bg-brand text-brand-foreground [&:hover:not(:disabled):not([data-disabled])]:bg-brand-hover',
  ghost:
    'border-transparent bg-transparent text-control-muted [&:hover:not(:disabled):not([data-disabled])]:bg-control-hover [&:hover:not(:disabled):not([data-disabled])]:text-ink',
  danger:
    'border-error-line bg-surface text-error-ink [&:hover:not(:disabled):not([data-disabled])]:bg-error-soft',
};
const sizes: Record<ButtonSize, string> = {
  md: 'min-h-9.5 gap-2 px-3.5 py-2 text-[13px]',
  sm: 'min-h-8 gap-1.5 px-2.5 py-1.5 text-xs',
  xs: 'min-h-7 gap-1.25 px-2 py-1 text-[11px]',
  icon: 'size-9 min-h-0 gap-2 p-0 text-[13px]',
  'icon-sm': 'size-8 min-h-0 gap-2 p-0 text-[13px]',
  'icon-xs': 'size-7 min-h-0 gap-2 p-0 text-[13px]',
};

export function buttonStyles({
  variant = 'outline',
  size = 'md',
  className = '',
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}) {
  return twMerge(base, variants[variant], sizes[size], className);
}
