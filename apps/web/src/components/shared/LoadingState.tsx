import type { ComponentProps } from 'react';
import { StateContainer } from './StateContainer';

type LoadingStateProps = Omit<ComponentProps<'div'>, 'children' | 'role'> & {
  message?: string;
};

export function LoadingState({ message = '正在加载…', ...props }: LoadingStateProps) {
  return (
    <StateContainer {...props} role="status">
      {message}
    </StateContainer>
  );
}
