import type { ComponentProps, ReactNode } from 'react';
import { Icon } from '@iconify/react/offline';
import styles from './IntegrationCard.module.css';

export function IntegrationCard({
  icon,
  title,
  description,
  status,
  actions,
}: {
  icon: ComponentProps<typeof Icon>['icon'];
  title: ReactNode;
  description: ReactNode;
  status: ReactNode;
  actions: ReactNode;
}) {
  return (
    <article className={styles.card}>
      <Icon icon={icon} width="18" className={styles.icon} aria-hidden="true" />
      <div className={styles.content}>
        <div className={styles.heading}>
          <h3>{title}</h3>
          {status}
        </div>
        <p className={styles.description}>{description}</p>
      </div>
      <div className={styles.actions}>{actions}</div>
    </article>
  );
}
