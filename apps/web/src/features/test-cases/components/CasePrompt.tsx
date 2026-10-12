'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { Icon } from '@iconify/react/offline';
import arrowRightIcon from '@iconify-icons/lucide/arrow-right';
import closeIcon from '@iconify-icons/lucide/x';
import { Button } from '@/components/ui/Button';
import { ReferenceTextarea } from '@/features/login-identities/components/InputReferences';
import { buttonStyles } from '@/components/ui/buttonStyles';
import '@/features/test-cases/components/test-editor.css';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  container: RefObject<HTMLElement | null>;
  finalFocus?: RefObject<HTMLButtonElement | null>;
  title: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  busy: boolean;
  onCancel: () => void;
  error: string;
  submitLabel: string;
  onSubmit: () => void | Promise<void>;
};

export function CasePrompt({
  open,
  onOpenChange,
  container,
  finalFocus,
  title,
  value,
  onChange,
  placeholder,
  busy,
  onCancel,
  error,
  submitLabel,
  onSubmit,
}: Props) {
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const [hint, setHint] = useState('');

  useEffect(() => {
    if (!open || value) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let index = 0;
    const timer = window.setInterval(
      () => {
        index = reduced ? placeholder.length : index + 1;
        setHint(placeholder.slice(0, index));
        if (index >= placeholder.length) window.clearInterval(timer);
      },
      reduced ? 1 : 65,
    );

    return () => window.clearInterval(timer);
  }, [open, value, placeholder]);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(open, details) => {
        if (!open) {
          if (busy) {
            details.cancel();
            onCancel();
          } else onOpenChange(false);
        }
      }}
    >
      <Dialog.Portal container={container}>
        <Dialog.Backdrop className="case-prompt-backdrop" />
        <Dialog.Popup
          id="case-prompt-section"
          className="case-prompt-overlay"
          initialFocus={promptRef}
          finalFocus={finalFocus}
          aria-busy={busy}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void onSubmit();
            }}
          >
            <div className="case-prompt-heading">
              <Dialog.Title className="sr-only">{title}</Dialog.Title>
              <Dialog.Close
                className={buttonStyles({
                  variant: 'ghost',
                  size: 'icon-sm',
                  className: 'rounded-lg text-ink',
                })}
                aria-label={busy ? '取消生成' : '关闭描述输入'}
                title={busy ? '取消生成（Esc）' : '关闭（Esc）'}
              >
                <Icon icon={closeIcon} width="18" aria-hidden="true" />
              </Dialog.Close>
            </div>
            <ReferenceTextarea
              textareaRef={promptRef}
              id="case-prompt"
              name="caseText"
              aria-label="测试步骤与预期结果"
              className="case-prompt-input"
              placeholder={hint}
              maxLength={20000}
              value={value}
              disabled={busy}
              onValueChange={onChange}
              onKeyDown={(event) => {
                if (
                  event.key === 'Enter' &&
                  (event.metaKey || event.ctrlKey) &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  void onSubmit();
                }
              }}
            />
            {error && (
              <p role="alert" className="case-prompt-error">
                {error}
              </p>
            )}
            <div className="case-prompt-footer">
              <Button
                type="submit"
                variant="outline"
                size="sm"
                className="gap-2 rounded-lg text-ink"
                disabled={busy || !value.trim()}
                title="⌘ / Ctrl + Enter"
              >
                {busy ? '生成中…' : submitLabel}
                <Icon icon={arrowRightIcon} width="16" aria-hidden="true" />
              </Button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
