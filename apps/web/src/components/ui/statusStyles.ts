import styles from './Status.module.css';
import { classNames } from '@/components/ui/classNames';

const colors: Record<string, string> = {
  passed: styles.passed,
  failed: styles.failed,
  running: styles.running,
  queued: styles.running,
  preparing: styles.running,
  finalizing: styles.running,
  cancelled: styles.cancelled,
};

export function statusStyles(status = 'none', className = '') {
  return classNames(styles.status, colors[status] ?? styles.none, className);
}
