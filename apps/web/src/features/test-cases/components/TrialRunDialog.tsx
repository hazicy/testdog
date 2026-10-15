'use client';

import { useTranslations } from 'next-intl';

import styles from './TrialRunDialog.module.css';

import { useCallback, useId, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { Icon } from '@iconify/react/offline';
import closeIcon from '@iconify-icons/lucide/x';
import { Dialog, DialogHeader } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { buttonStyles } from '@/components/ui/buttonStyles';
import { fetchJson } from '@/client/api';
import { isActiveRun, type TestRun } from '@testdog/contracts/runs/types';
import { RunDetail } from '@/features/runs/components/RunDetail';

export function TrialRunDialog({
  id,
  open,
  onClose,
  onActiveChange,
}: {
  id: string;
  open: boolean;
  onClose: () => void;
  onActiveChange: (active: boolean) => void;
}) {
  const t = useTranslations('editor');
  const statusText = useTranslations('workspace');
  const titleId = useId();
  const [currentId, setCurrentId] = useState(id);
  const [run, setRun] = useState<TestRun>();
  const updateRun = useCallback(
    (next: TestRun) => {
      setRun(next);
      onActiveChange(isActiveRun(next.status));
    },
    [onActiveChange],
  );

  // The full workbench owns live updates while open; only poll status when closed.
  useSWR(
    !open && (!run || isActiveRun(run.status)) ? [`/api/runs/${currentId}`, 'trial-status'] : null,
    ([url]) => fetchJson<{ run: TestRun }>(url),
    { refreshInterval: 5000, onSuccess: (data) => updateRun(data.run) },
  );

  if (!open) return null;

  return (
    <Dialog titleId={titleId} busy={false} onDismiss={onClose} className={styles.dialog}>
      <DialogHeader className={styles.dialogHeader}>
        <div>
          <h2 id={titleId} className={styles.heading}>
            {t('draftTrial')}
            {run ? ` · ${statusText(run.status)}` : ''}
          </h2>
        </div>
        <div className={styles.container}>
          <Link
            href={`/runs/${currentId}`}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonStyles({ variant: 'ghost', size: 'sm' })}
          >
            {t('viewFullRun')}
          </Link>
          <Button size="icon-sm" variant="ghost" aria-label={t('closeTrial')} onClick={onClose}>
            <Icon icon={closeIcon} width="18" aria-hidden="true" />
          </Button>
        </div>
      </DialogHeader>
      <div className={styles.runContent}>
        <RunDetail
          key={currentId}
          id={currentId}
          embedded
          onRunChange={updateRun}
          onRunCreated={(next) => {
            setCurrentId(next.id);
            updateRun(next);
          }}
        />
      </div>
    </Dialog>
  );
}
