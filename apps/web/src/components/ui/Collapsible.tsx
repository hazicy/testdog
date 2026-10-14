'use client';

import { Collapsible as BaseCollapsible } from '@base-ui/react/collapsible';
import type { ComponentProps, ReactElement, ReactNode } from 'react';
import styles from './Collapsible.module.css';

export type CollapsibleProps = Omit<ComponentProps<typeof BaseCollapsible.Root>, 'children'> & {
  trigger: ReactElement;
  children: ReactNode;
};

export function Collapsible({ trigger, children, ...props }: CollapsibleProps) {
  return (
    <BaseCollapsible.Root {...props} data-slot="collapsible">
      <BaseCollapsible.Trigger render={trigger} data-slot="collapsible-trigger" />
      <BaseCollapsible.Panel keepMounted className={styles.panel}>
        {children}
      </BaseCollapsible.Panel>
    </BaseCollapsible.Root>
  );
}
