'use client';

import { useTranslations } from 'next-intl';

import styles from './DeleteTestDialog.module.css';

import { DialogFooter } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { useState } from 'react';
import type { TestCase } from '@testdog/contracts/test-cases/types';
import { api } from '@/client/api';
import { Dialog } from '@/components/ui/Dialog';

export function DeleteTestDialog({
  test,
  onClose,
  onDeleted,
}: {
  test: TestCase;
  onClose: () => void;
  onDeleted: () => Promise<void>;
}) {
  const t = useTranslations('editor');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  async function remove() {
    setSaving(true);
    setFormError('');
    try {
      await api.delete(`/api/tests/${test.id}`);
      await onDeleted();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : t('deleteFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog titleId="delete-title" busy={saving} onDismiss={onClose} className={styles.dialog}>
      <div className={styles.container}>
        <h2 id="delete-title" className={styles.deleteTitle}>
          {t('deleteTitle')}
        </h2>
        <p className={styles.description}>{t('deleteDescription', { name: test.name })}</p>
        {formError && (
          <p role="alert" className={styles.error}>
            {formError}
          </p>
        )}
      </div>
      <DialogFooter>
        <Button disabled={saving} onClick={() => onClose()}>
          {t('cancel')}
        </Button>
        <Button disabled={saving} variant="danger" onClick={() => void remove()}>
          {saving ? t('deleting') : t('delete')}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
