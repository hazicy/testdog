import type { ComponentProps } from 'react';
import { StateContainer } from './StateContainer';
import { EmptyIllustration } from '@/components/brand/EmptyIllustration';

type LoadingStateProps = Omit<ComponentProps<'div'>, 'children' | 'role'> & {
  message?: string;
};

export function LoadingState({ message = '正在加载…', ...props }: LoadingStateProps) {
  return (
    <StateContainer {...props} role="status" aria-label={message}>
      <EmptyIllustration variant="loading" />
    </StateContainer>
  );
}
