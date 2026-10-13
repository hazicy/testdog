import styles from './ErrorState.module.css';
import Link from 'next/link';
import { EmptyIllustration } from '@/components/brand/EmptyIllustration';
import { Button } from '@/components/ui/Button';
import { buttonStyles } from '@/components/ui/buttonStyles';

export function ErrorState({
  title,
  illustration,
  message,
  retry,
  href = '/cases',
  linkLabel = '返回测试工作台',
}: {
  title: string;
  illustration?: 'not-found';
  message: string;
  retry?: () => void;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <section className={styles.section} aria-label={title}>
      {illustration && <EmptyIllustration variant={illustration} />}
      <h1 className={styles.title}>{title}</h1>
      <p role="alert" className={styles.error}>
        {message}
      </p>
      <div className={styles.container}>
        {retry && (
          <Button variant="primary" onClick={retry}>
            重试
          </Button>
        )}
        <Link className={buttonStyles()} href={href}>
          {linkLabel}
        </Link>
      </div>
    </section>
  );
}
