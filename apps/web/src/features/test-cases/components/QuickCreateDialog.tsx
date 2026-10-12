'use client';

import { useState, type RefObject } from 'react';
import { CasePrompt } from '@/features/test-cases/components/CasePrompt';
import { useRouter } from 'next/navigation';
import { usePlanCompilation } from '@/features/test-cases/hooks/usePlanCompilation';
import { caseName, editablePlan, goalUrl } from '@/features/test-cases/lib/authoring';
import { writeCaseDraft } from '@/features/test-cases/lib/caseDraft';

export function QuickCreateDialog({
  onClose,
  container,
}: {
  onClose: () => void;
  container: RefObject<HTMLElement | null>;
}) {
  const router = useRouter();
  const [goal, setGoal] = useState('');
  const compilation = usePlanCompilation();
  const { busy } = compilation;
  const [error, setError] = useState('');

  async function create() {
    if (busy || !goal.trim()) return;
    setError('');
    try {
      const url = goalUrl(goal);
      const source = await compilation.compile({ goal: goal.trim(), url });

      if (!source) return;
      const root = source.nodes[source.rootId];
      const name = caseName(root.kind === 'branch' ? goal : root.goal);
      const plan = editablePlan(source, name);
      const id = crypto.randomUUID();

      writeCaseDraft(id, { name, url: url ?? '', goal, plan });
      router.push(`/cases/editor/${id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '生成失败，请重试');
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
      onCancel={() => {
        compilation.cancel();
        setError('已取消生成，描述已保留。');
      }}
      error={error}
      submitLabel="生成"
      onSubmit={create}
    />
  );
}
