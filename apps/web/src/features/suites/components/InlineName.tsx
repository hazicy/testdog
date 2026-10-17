'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/Input';
import styles from './Suites.module.css';

export function InlineName({
  initialName,
  onSave,
  onCancel,
  maxLength = 100,
}: {
  initialName: string;
  maxLength?: number;
  onSave: (name: string) => Promise<void>;
  onCancel: () => void;
}) {
  const t = useTranslations('suites');
  const [name, setName] = useState(initialName);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const finished = useRef(false);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  async function save() {
    if (finished.current) return;
    if (!name.trim() || name.trim() === initialName) {
      finished.current = true;
      onCancel();

      return;
    }

    finished.current = true;
    setPending(true);
    setError('');
    try {
      await onSave(name.trim());
    } catch (cause) {
      finished.current = false;
      setPending(false);
      setError(cause instanceof Error ? cause.message : t('saveFailed'));
      requestAnimationFrame(() => input.current?.focus());
    }
  }

  return (
    <div className={styles.inlineEdit}>
      <Input
        ref={input}
        aria-label={t('itemName')}
        value={name}
        maxLength={maxLength}
        disabled={pending}
        aria-invalid={!!error}
        onChange={(event) => setName(event.target.value)}
        onBlur={() => void save()}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || event.keyCode === 229) return;
          if (event.key === 'Enter') {
            event.preventDefault();
            void save();
          }

          if (event.key === 'Escape' && !pending) {
            event.preventDefault();
            finished.current = true;
            onCancel();
          }
        }}
      />
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}
