'use client';

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Issue } from '@testdog/contracts/issues/types';
import { api } from '@/client/api';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogFooter } from '@/components/ui/Dialog';
import styles from './DeleteIssueDialog.module.css';

export function DeleteIssueDialog({
  issue,
  onDismiss,
  onDeleted,
}: {
  issue: Issue;
  onDismiss: () => void;
  onDeleted: () => Promise<void>;
}) {
  const t = useTranslations('issues');
  const titleId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function remove() {
    setBusy(true);
    setError('');
    try {
      await api.delete(`/api/issues/${issue.id}`);
      await onDeleted();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('deleteFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog titleId={titleId} busy={busy} onDismiss={onDismiss} className={styles.dialog}>
      <div className={styles.body}>
        <h2 id={titleId} className={styles.title}>
          {t('deleteIssue')}
        </h2>
        <p className={styles.description}>{t('deleteConfirmation', { title: issue.title })}</p>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
      </div>
      <DialogFooter>
        <Button disabled={busy} onClick={onDismiss}>
          {t('cancel')}
        </Button>
        <Button variant="danger" disabled={busy} onClick={() => void remove()}>
          {busy ? t('deleting') : t('deleteIssue')}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
