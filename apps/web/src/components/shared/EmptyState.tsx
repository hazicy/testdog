import type { ComponentProps, ReactNode } from 'react';
import { StateContainer } from './StateContainer';
import styles from './EmptyState.module.css';
import textStyles from './StateContainer.module.css';
import { EmptyIllustration } from '@/components/brand/EmptyIllustration';

type EmptyStateProps = Omit<ComponentProps<'div'>, 'children'> & {
  message: string;
  icon?: ReactNode;
  illustration?: 'empty' | 'tests' | 'runs' | 'search' | 'not-found';
  actions?: ReactNode;
};

export function EmptyState({
  message,
  icon,
  illustration = 'empty',
  actions,
  ...props
}: EmptyStateProps) {
  return (
    <StateContainer {...props}>
      {icon ? (
        <div className={styles.icon} aria-hidden="true">
          {icon}
        </div>
      ) : (
        <EmptyIllustration variant={illustration} />
      )}
      <p className={textStyles.message}>{message}</p>
      {actions && <div className={styles.actions}>{actions}</div>}
    </StateContainer>
  );
}
