import styles from './Brand.module.css';
import Image from 'next/image';

export function Brand({
  compact = false,
  monochrome = false,
}: {
  compact?: boolean;
  monochrome?: boolean;
}) {
  return (
    <span className={styles.brand}>
      {monochrome ? (
        <span className={styles.monochrome· Mark} aria-hidden="true" />
      ) : (
        <Image src="/brand/testdog-mark.svg" alt="" width={32} height={32} unoptimized />
      )}
      {!compact && (
        <span className={styles.wordmark}>
          testdog<span className={styles.accent}>.</span>
        </span>
      )}
    </span>
  );
}
