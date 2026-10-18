import type { ReactNode } from 'react';
import styles from './SectionHeader.module.css';

export function SectionHeader({
  id,
  title,
  actions,
}: {
  id?: string;
  title: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className={styles.header}>
      <h2 id={id}>{title}</h2>
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}
