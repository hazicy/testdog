'use client';
import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import { useRef, type ReactNode } from 'react';
export function Dialog({
  children,
  titleId,
  busy,
  onDismiss,
  className = '',
  initialFocus,
}: {
  children: ReactNode;
  titleId: string;
  busy: boolean;
  onDismiss: () => void;
  className?: string;
  initialFocus?: string;
}) {
  const popup = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<Element | null>(null);
  return (
    <BaseDialog.Root
      open
      onOpenChange={(open, details) => {
        if (open) return;
        // A Select portal shares the document's Escape event with its parent dialog.
        // Let the open Select close first, preserving the form beneath it.
        if (
          busy ||
          (details.reason === 'escape-key' &&
            popup.current?.querySelector('[role="combobox"][aria-expanded="true"]'))
        ) {
          details.cancel();
          return;
        }
        onDismiss();
      }}
      disablePointerDismissal
    >
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="ws-dialog-backdrop" />
        <BaseDialog.Viewport className="ws-dialog-viewport">
          <BaseDialog.Popup
            ref={popup}
            className={`ws-dialog ${className}`}
            aria-labelledby={titleId}
            aria-busy={busy}
            initialFocus={() => {
              previousFocus.current = document.activeElement;
              return (
                (initialFocus
                  ? popup.current?.querySelector<HTMLElement>(initialFocus)
                  : popup.current?.querySelector<HTMLElement>('button:not(:disabled)')) ??
                popup.current
              );
            }}
            finalFocus={() => {
              // Resolve after unmount: saving or deleting can remove the original trigger.
              // Focus the main element itself rather than Base UI's first tabbable descendant.
              queueMicrotask(() => {
                const previous = previousFocus.current;
                const target =
                  previous instanceof HTMLElement && previous.isConnected
                    ? previous
                    : document.getElementById('main-content');
                target?.focus();
              });
              return false;
            }}
          >
            {children}
          </BaseDialog.Popup>
        </BaseDialog.Viewport>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}
