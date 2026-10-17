import { useTranslations } from 'next-intl';
import type { RunArtifact } from '@testdog/contracts/runs/types';

export const time = (ms: number) =>
  `${Math.floor(ms / 60000)
    .toString()
    .padStart(2, '0')}:${Math.floor((ms / 1000) % 60)
    .toString()
    .padStart(2, '0')}`;
export const asset = (runId: string, artifact: RunArtifact) =>
  `/api/runs/${runId}/artifacts/${artifact.id}`;

export function useModelCallPurposes(): Record<string, string> {
  const t = useTranslations('runs.purposes');

  return {
    plan: t('plan'),
    native_action: t('native_action'),
    hybrid_dom_plan: t('hybrid_dom_plan'),
    dom_choice: t('dom_choice'),
    assertion_result: t('assertion_result'),
    branch_result: t('branch_result'),
  };
}
