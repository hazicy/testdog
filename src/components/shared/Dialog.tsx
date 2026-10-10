'use client';

import { useEffect, useRef, type ReactNode } from 'react';

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
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    if (!element?.open) element?.showModal();
    if (initialFocus) element?.querySelector<HTMLElement>(initialFocus)?.focus();
    return () => {
      element?.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
      else document.getElementById('main-content')?.focus();
    };
  }, [initialFocus]);
  return (
    <dialog
      ref={dialog}
      className={`ws-dialog ${className}`}
      aria-labelledby={titleId}
      aria-busy={busy}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onDismiss();
      }}
    >
      {children}
    </dialog>
  );
}
