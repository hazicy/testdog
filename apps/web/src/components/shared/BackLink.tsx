import Link from 'next/link';
import { Icon } from '@iconify/react/offline';
import arrowLeftIcon from '@iconify-icons/lucide/arrow-left';
import styles from './BackLink.module.css';

export function BackLink({
  href,
  children,
  iconOnly = false,
}: {
  href: string;
  children: string;
  iconOnly?: boolean;
}) {
  return (
    <Link
      href={href}
      className={styles.link}
      aria-label={iconOnly ? children : undefined}
      title={iconOnly ? children : undefined}
    >
      <Icon icon={arrowLeftIcon} className={styles.icon} aria-hidden="true" />
      {!iconOnly && <span>{children}</span>}
    </Link>
  );
}
