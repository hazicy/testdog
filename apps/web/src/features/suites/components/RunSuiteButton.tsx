'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useRunSubmission } from '@/client/useRunSubmission';
import { Button } from '@/components/ui/Button';

export function RunSuiteButton({
  id,
  disabled,
  onError,
}: {
  id: string;
  disabled?: boolean;
  onError: (message: string) => void;
}) {
  const t = useTranslations('suites');
  const router = useRouter();
  const submit = useRunSubmission();
  const [pending, setPending] = useState(false);

  async function start() {
    if (pending) return;
    setPending(true);
    onError('');
    try {
      const { batchId } = await submit<{ batchId: string }>(`/api/suites/${id}/runs`, {});

      router.push(`/cases/batches/${batchId}`);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : t('startFailed'));
    } finally {
      setPending(false);
    }
  }

  return (
    <Button variant="primary" disabled={pending || disabled} onClick={start}>
      {t(pending ? 'starting' : 'run')}
    </Button>
  );
}
