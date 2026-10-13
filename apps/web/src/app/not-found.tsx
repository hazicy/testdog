import styles from './not-found.module.css';
import { ErrorState } from '@/components/shared/ErrorState';

export default function NotFound() {
  return (
    <div className={styles.container}>
      <ErrorState
        illustration="not-found"
        title="页面不存在"
        message="地址可能不正确，或页面已被移除。"
      />
    </div>
  );
}
