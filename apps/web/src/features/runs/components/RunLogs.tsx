'use client';

import { useTranslations } from 'next-intl';

import studioStyles from '@/features/runs/components/run-studio.module.css';

import { ModelUsagePanel } from '@/features/runs/components/ModelUsagePanel';
import type { TestRun } from '@testdog/contracts/runs/types';

type Props = {
  id: string;
  run?: TestRun;
  onStep: (id: string) => void;
};

export function RunLogs({ id, run, onStep }: Props) {
  const t = useTranslations('runs');

  return (
    <div className={studioStyles.studioPanel} aria-label={t('aiContent')}>
      <ModelUsagePanel
        id={id}
        active={!!run && ['queued', 'preparing', 'running', 'finalizing'].includes(run.status)}
        onStep={onStep}
      />
    </div>
  );
}
