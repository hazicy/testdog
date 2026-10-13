import styles from './EmptyIllustration.module.css';
import Image from 'next/image';

export function EmptyIllustration({
  variant,
}: {
  variant: 'empty' | 'tests' | 'runs' | 'search' | 'not-found' | 'error' | 'loading';
}) {
  return (
    <Image
      src={`/illustrations/testdog-${variant}.svg`}
      alt=""
      width={160}
      height={120}
      className={variant === 'loading' ? styles.loading : styles.image}
      unoptimized
    />
  );
}
