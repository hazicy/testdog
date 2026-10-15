import { useTranslations } from 'next-intl';
import styles from './ErrorState.module.css';
import textStyles from './StateContainer.module.css';
import Link from 'next/link';
import { EmptyIllustration } from '@/components/brand/EmptyIllustration';
import { Button } from '@/components/ui/Button';
import { buttonStyles } from '@/components/ui/buttonStyles';
import { StateContainer } from './StateContainer';

export function ErrorState({
  illustration = 'error',
  message,
  retry,
  href = '/cases',
  linkLabel,
}: {
  illustration?: 'not-found' | 'error';
  message: string;
  retry?: () => void;
  href?: string;
  linkLabel?: string;
}) {
  const t = useTranslations('shared');

  return (
    <StateContainer aria-label={message}>
      <EmptyIllustration variant={illustration} />
      <p role="alert" className={textStyles.message}>
        {message}
      </p>
      <div className={styles.container}>
        {retry && (
          <Button variant="primary" size="sm" onClick={retry}>
            {t('retry')}
          </Button>
        )}
        <Link className={buttonStyles({ size: 'sm' })} href={href}>
          {linkLabel ?? t('backToTests')}
        </Link>
      </div>
    </StateContainer>
  );
}
