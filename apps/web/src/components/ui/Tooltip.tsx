'use client';

import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip';
import type { ReactElement, ReactNode } from 'react';
import styles from './Tooltip.module.css';

export type TooltipProps = {
  children: ReactElement;
  content: ReactNode;
  disabled?: boolean;
  delay?: number;
  side?: BaseTooltip.Positioner.Props['side'];
  align?: BaseTooltip.Positioner.Props['align'];
};

export function Tooltip({
  children,
  content,
  disabled = false,
  delay = 0,
  side = 'bottom',
  align = 'start',
}: TooltipProps) {
  return (
    <BaseTooltip.Provider delay={delay}>
      <BaseTooltip.Root>
        <BaseTooltip.Trigger render={children} disabled={disabled} />
        <BaseTooltip.Portal>
          <BaseTooltip.Positioner
            side={side}
            align={align}
            sideOffset={10}
            className={styles.positioner}
          >
            <BaseTooltip.Popup className={styles.popup}>{content}</BaseTooltip.Popup>
          </BaseTooltip.Positioner>
        </BaseTooltip.Portal>
      </BaseTooltip.Root>
    </BaseTooltip.Provider>
  );
}
