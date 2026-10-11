'use client';

import { buttonStyles } from '@/components/ui/buttonStyles';

import { Menu } from '@base-ui/react/menu';
import { Icon } from '@iconify/react/offline';
import moreIcon from '@iconify-icons/lucide/ellipsis';
import { useRef, type ComponentProps } from 'react';

type Action = {
  label: string;
  accessibleLabel: string;
  icon: ComponentProps<typeof Icon>['icon'];
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
};

export function WorkspaceRowMenu({ label, actions }: { label: string; actions: Action[] }) {
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
          variant: 'ghost',
          size: 'icon-xs',
          className: 'workspace-row-menu-trigger',
        })}
        aria-label={label}
      >
        <Icon icon={moreIcon} width="17" aria-hidden="true" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner
          side="bottom"
          align="end"
          sideOffset={6}
          className="workspace-row-menu-positioner"
        >
          <Menu.Popup className="workspace-row-menu" aria-label={label}>
            {actions.map((action) => (
              <Menu.Item
                key={action.accessibleLabel}
                aria-label={action.accessibleLabel}
                className={`workspace-row-menu-item${action.danger ? ' is-danger' : ''}`}
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
