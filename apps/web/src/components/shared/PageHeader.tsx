import type { ReactNode } from 'react';
import styles from './PageHeader.module.css';

export function PageHeader({
  title,
  actions,
  description,
}: {
  title: ReactNode;
  actions?: ReactNode;
  description?: ReactNode;
}) {
  return (
    <header className={styles.header}>
      <div className={styles.identity}>
        <h1 className={styles.title}>{title}</h1>
        {description && <p className={styles.description}>{description}</p>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  );
}
