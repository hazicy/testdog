import { useTranslations } from 'next-intl';
import type { ComponentProps } from 'react';
import { StateContainer } from './StateContainer';
import { EmptyIllustration } from '@/components/brand/EmptyIllustration';

type LoadingStateProps = Omit<ComponentProps<'div'>, 'children' | 'role'> & {
  message?: string;
};

export function LoadingState({ message, ...props }: LoadingStateProps) {
  const t = useTranslations('shared');

  return (
    <StateContainer {...props} role="status" aria-label={message ?? t('loading')}>
      <EmptyIllustration variant="loading" />
    </StateContainer>
  );
}
