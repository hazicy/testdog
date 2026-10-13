import clsx from 'clsx';
import type { ComponentProps } from 'react';
import styles from './StateContainer.module.css';

/** Fill the available page or panel area while keeping state content centered. */
export function StateContainer({ className, ...props }: ComponentProps<'div'>) {
  return <div className={clsx(styles.container, className)} {...props} />;
}
