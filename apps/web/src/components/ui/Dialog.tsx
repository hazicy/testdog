'use client';

import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import { useRef, type ReactNode, type ComponentProps } from 'react';
import { twMerge } from 'tailwind-merge';

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
            popup.current?.querySelector(
              '[role="combobox"][aria-expanded="true"], [aria-haspopup="menu"][aria-expanded="true"]',
            ))
        ) {
          details.cancel();

          return;
        }

        onDismiss();
      }}
      disablePointerDismissal
    >
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="absolute inset-0 z-50 bg-backdrop backdrop-blur-[2px]" />
        <BaseDialog.Viewport className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
          <BaseDialog.Popup
            ref={popup}
            className={twMerge(
              'relative w-full max-w-[620px] max-h-[calc(100dvh-48px)] overflow-y-auto rounded-xl border border-dialog-line bg-surface p-0 text-ink shadow-[0_20px_80px_var(--shadow)]',
              className,
            )}
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

export function DialogHeader({ className = '', ...props }: ComponentProps<'div'>) {
  return (
    <div
      {...props}
      className={twMerge(
        'flex items-start justify-between gap-4 border-b border-page-line px-6 py-[22px]',
        className,
      )}
    />
  );
}

export function DialogFooter({ className = '', ...props }: ComponentProps<'div'>) {
  return (
    <div
      {...props}
      className={twMerge(
        'flex justify-end gap-2.5 border-t border-page-line bg-surface-muted px-6 py-4',
        className,
      )}
    />
  );
}
