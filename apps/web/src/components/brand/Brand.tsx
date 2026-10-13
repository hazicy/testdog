import styles from './Brand.module.css';
import Image from 'next/image';

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className={styles.brand}>
      <Image src="/brand/testdog-mark.svg" alt="" width={32} height={32} unoptimized />
      {!compact && (
        <span className={styles.wordmark}>
          testdog<span className={styles.accent}>.</span>
        </span>
      )}
    </span>
  );
}
