'use client';

import { useTranslations } from 'next-intl';

import { useState, type RefObject } from 'react';
import { CasePrompt } from '@/features/test-cases/components/CasePrompt';
import { useRouter } from 'next/navigation';
import { usePlanCompilation } from '@/features/test-cases/hooks/usePlanCompilation';
import { useAuthoring } from '@/features/test-cases/hooks/useAuthoring';
import { writeCaseDraft } from '@/features/test-cases/lib/caseDraft';

export function QuickCreateDialog({
  onClose,
  container,
}: {
  onClose: () => void;
  container: RefObject<HTMLElement | null>;
}) {
  const t = useTranslations('editor');
  const { caseName, editablePlan } = useAuthoring();
  const router = useRouter();
  const [goal, setGoal] = useState('');
  const compilation = usePlanCompilation();
  const { busy } = compilation;
  const [error, setError] = useState('');

  async function create() {
    if (busy || !goal.trim()) return;
    setError('');
    try {
      const source = await compilation.compile({ goal: goal.trim() });

      if (!source) return;
      const root = source.nodes[source.rootId];
      const name = caseName(root.kind === 'branch' ? goal : root.goal);
      const plan = editablePlan(source, name);
      const id = crypto.randomUUID();

      writeCaseDraft(id, { name, goal, plan });
      router.push(`/cases/editor/${id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('generateFailed'));
    }
  }

  return (
    <CasePrompt
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      container={container}
      title={t('quickCreate')}
      value={goal}
      onChange={setGoal}
      placeholder={t('prompt')}
      busy={busy}
      onCancel={() => {
        compilation.cancel();
        setError(t('cancelledPrompt'));
      }}
      error={error}
      submitLabel={t('generate')}
      onSubmit={create}
    />
  );
}
