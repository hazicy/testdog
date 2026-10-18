'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogHeader, DialogFooter } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import styles from './Suites.module.css';

export function FolderNameDialog({
  initialName,
  onSave,
  onCancel,
}: {
  initialName?: string;
  onSave: (name: string) => Promise<void>;
  onCancel: () => void;
}) {
  const t = useTranslations('suites');
  const [name, setName] = useState(initialName ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    if (!name.trim() || pending) return;
    setPending(true);
    setError('');
    try {
      await onSave(name.trim());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('saveFailed'));
      setPending(false);
    }
  }

  return (
    <Dialog titleId="folder-name-title" busy={pending} onDismiss={onCancel} initialFocus="input">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <DialogHeader>
          <h2 id="folder-name-title">{t(initialName === undefined ? 'create' : 'rename')}</h2>
        </DialogHeader>
        <div className={styles.editor}>
          <Input
            aria-label={t('itemName')}
            value={name}
            maxLength={100}
            disabled={pending}
            onChange={(event) => setName(event.target.value)}
          />
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" disabled={pending} onClick={onCancel}>
            {t('cancel')}
          </Button>
          <Button type="submit" variant="primary" disabled={pending || !name.trim()}>
            {t('save')}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
