import styles from './EmptyIllustration.module.css';
import Image from 'next/image';

export function EmptyIllustration({
  variant,
}: {
  variant: 'tests' | 'runs' | 'search' | 'not-found';
}) {
  return (
    <Image
      src={`/illustrations/testdog-${variant}.svg`}
      alt=""
      width={240}
      height={160}
      className={styles.image}
      unoptimized
    />
  );
}
