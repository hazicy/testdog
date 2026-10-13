import type { ComponentProps, ReactNode } from 'react';
import { StateContainer } from './StateContainer';
import styles from './EmptyState.module.css';

type EmptyStateProps = Omit<ComponentProps<'div'>, 'children' | 'title'> & {
  title: string;
  icon?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
};

export function EmptyState({ title, icon, description, actions, ...props }: EmptyStateProps) {
  return (
    <StateContainer {...props}>
      {icon && (
        <div className={styles.icon} aria-hidden="true">
          {icon}
        </div>
      )}
      <h2 className={styles.title}>{title}</h2>
      {description && <p className={styles.description}>{description}</p>}
      {actions && <div className={styles.actions}>{actions}</div>}
    </StateContainer>
  );
}
