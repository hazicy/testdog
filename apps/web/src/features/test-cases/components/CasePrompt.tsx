'use client';

import { useTranslations } from 'next-intl';

import editorStyles from '@/features/test-cases/components/test-editor.module.css';
import styles from './CasePrompt.module.css';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { Icon } from '@iconify/react/offline';
import arrowRightIcon from '@iconify-icons/lucide/arrow-right';
import closeIcon from '@iconify-icons/lucide/x';
import { Button } from '@/components/ui/Button';
import { buttonStyles } from '@/components/ui/buttonStyles';

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
  const t = useTranslations('editor');
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
        <Dialog.Backdrop className={editorStyles.casePromptBackdrop} />
        <Dialog.Popup
          data-ui="case-prompt-overlay"
          id="case-prompt-section"
          className={editorStyles.casePromptOverlay}
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
            <div className={editorStyles.casePromptHeading}>
              <Dialog.Title className={styles.accessibleLabel}>{title}</Dialog.Title>
              <Dialog.Close
                className={buttonStyles({
                  variant: 'ghost',
                  size: 'icon-sm',
                  className: styles.close,
                })}
                aria-label={busy ? t('cancelGeneration') : t('closePrompt')}
                title={busy ? t('cancelGenerationEsc') : t('closeEsc')}
              >
                <Icon icon={closeIcon} width="18" aria-hidden="true" />
              </Dialog.Close>
            </div>
            <textarea
              data-ui="case-prompt-input"
              ref={promptRef}
              id="case-prompt"
              name="caseText"
              aria-label={t('stepsAndResults')}
              className={editorStyles.casePromptInput}
              placeholder={hint}
              maxLength={20000}
              value={value}
              disabled={busy}
              onChange={(event) => onChange(event.target.value)}
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
              <p role="alert" className={editorStyles.casePromptError}>
                {error}
              </p>
            )}
            <div className={editorStyles.casePromptFooter}>
              <Button
                type="submit"
                variant="outline"
                size="sm"
                className={styles.action}
                disabled={busy || !value.trim()}
                title="⌘ / Ctrl + Enter"
              >
                {busy ? t('generating') : submitLabel}
                <Icon icon={arrowRightIcon} width="16" aria-hidden="true" />
              </Button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
