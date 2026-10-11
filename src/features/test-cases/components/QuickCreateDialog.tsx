'use client';

import { useState, type RefObject } from 'react';
import { CasePrompt } from './CasePrompt';
import { useRouter } from 'next/navigation';
import { compilePlan } from '../lib/compilePlan';
import { caseName, editablePlan, goalUrl } from '../lib/authoring';
import { writeCaseDraft } from '../lib/caseDraft';

export function QuickCreateDialog({
  onClose,
  container,
}: {
  onClose: () => void;
  container: RefObject<HTMLElement | null>;
}) {
  const router = useRouter();
  const [goal, setGoal] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function create() {
    if (busy || !goal.trim()) return;
    setBusy(true);
    setError('');
    try {
      const url = goalUrl(goal);
      const source = await compilePlan(goal.trim(), url);
      const root = source.nodes[source.rootId];
      const name = caseName(root.kind === 'branch' ? goal : root.goal);
      const plan = editablePlan(source, name);
      const id = crypto.randomUUID();

      writeCaseDraft(id, { name, url: url ?? '', goal, plan });
      router.push(`/cases/editor/${id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '生成失败，请重试');
      setBusy(false);
    }
  }

  return (
    <CasePrompt
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      container={container}
      title="快速创建"
      value={goal}
      onChange={setGoal}
      placeholder="描述测试步骤和预期结果，可附上网站地址…"
      busy={busy}
      error={error}
      submitLabel="生成"
      onSubmit={create}
    />
  );
}
