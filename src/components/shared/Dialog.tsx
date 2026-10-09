'use client';

import { useEffect, useRef, type ReactNode } from 'react';

export function Dialog({
  children,
  titleId,
  busy,
  onDismiss,
  className = '',
}: {
  children: ReactNode;
  titleId: string;
  busy: boolean;
  onDismiss: () => void;
  className?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className={`ws-dialog ${className}`}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onDismiss();
      }}
    >
      {children}
    </dialog>
  );
}
