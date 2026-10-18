'use client';

import clsx from 'clsx';

import workspaceStyles from '@/features/workspace/components/workspace-index.module.css';

import { buttonStyles } from '@/components/ui/buttonStyles';
import { Menu } from '@base-ui/react/menu';
import { Icon } from '@iconify/react/offline';
import moreIcon from '@iconify-icons/lucide/ellipsis';
import chevronDownIcon from '@iconify-icons/lucide/chevron-down';
import { useRef, type ComponentProps } from 'react';

type Action = {
  label: string;
  accessibleLabel: string;
  icon: ComponentProps<typeof Icon>['icon'];
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
  separatorBefore?: boolean;
};

export function WorkspaceRowMenu({
  label,
  actions,
  icon = moreIcon,
  text,
}: {
  label: string;
  text?: string;
  actions: Action[];
  icon?: ComponentProps<typeof Icon>['icon'];
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const pendingAction = useRef<(() => void) | null>(null);

  return (
    <Menu.Root
      onOpenChangeComplete={(open) => {
        if (open || !pendingAction.current) return;
        const action = pendingAction.current;

        pendingAction.current = null;
        // Finish closing the menu before a selected action opens a dialog.
        queueMicrotask(() => {
          trigger.current?.focus();
          action();
        });
      }}
    >
      <Menu.Trigger
        ref={trigger}
        className={buttonStyles({
          variant: text ? 'outline' : 'ghost',
          size: text ? 'sm' : 'icon-xs',
          className: workspaceStyles.workspaceRowMenuTrigger,
        })}
        aria-label={label}
      >
        <Icon icon={icon} width="17" aria-hidden="true" />
        {text}
        {text && <Icon icon={chevronDownIcon} width="14" aria-hidden="true" />}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner
          side="bottom"
          align="end"
          sideOffset={6}
          className={workspaceStyles.workspaceRowMenuPositioner}
        >
          <Menu.Popup className={workspaceStyles.workspaceRowMenu} aria-label={label}>
            {actions.map((action) => (
              <Menu.Item
                key={action.accessibleLabel}
                aria-label={action.accessibleLabel}
                className={clsx(workspaceStyles.workspaceRowMenuItem, {
                  [workspaceStyles.isDanger]: action.danger,
                  [workspaceStyles.hasSeparator]: action.separatorBefore,
                })}
                disabled={action.disabled}
                onClick={() => {
                  pendingAction.current = action.onSelect;
                }}
              >
                <Icon icon={action.icon} width="15" aria-hidden="true" />
                {action.label}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
