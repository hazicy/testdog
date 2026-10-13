import styles from './Button.module.css';
import clsx from 'clsx';

export type ButtonVariant = 'outline' | 'primary' | 'soft' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'sm' | 'xs' | 'icon' | 'icon-sm' | 'icon-xs';

const base = styles.base;
const variants: Record<ButtonVariant, string> = {
  outline: styles.outline,
  primary: styles.primary,
  soft: styles.soft,
  ghost: styles.ghost,
  danger: styles.danger,
};
const sizes: Record<ButtonSize, string> = {
  md: styles.md,
  sm: styles.sm,
  xs: styles.xs,
  icon: styles.icon,
  'icon-sm': styles.iconSm,
  'icon-xs': styles.iconXs,
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
  return clsx(base, variants[variant], sizes[size], className);
}
