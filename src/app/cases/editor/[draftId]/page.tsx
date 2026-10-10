'use client';

import { useSyncExternalStore } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { TestEditor } from '@/features/test-cases/components/TestEditor';
import { clearCaseDraft, readCaseDraft } from '@/features/test-cases/lib/caseDraft';

export default function CaseCanvasPage() {
  const { draftId } = useParams<{ draftId: string }>();
  const router = useRouter();
  const raw = useSyncExternalStore(
    () => () => {},
    () => sessionStorage.getItem(`caseforge:case-draft:${draftId}`),
    () => undefined,
  );

  if (raw === undefined)
    return (
      <p className="p-6" role="status">
        正在打开画板…
      </p>
    );
  const draft = readCaseDraft(draftId);

  if (!draft)
    return (
      <div className="p-6">
        <p>当前草稿不可用。</p>
        <Link href="/cases">返回用例列表</Link>
      </div>
    );

  return (
    <TestEditor
      key={draftId}
      test={draft.test}
      duplicate={draft.duplicate}
      initialDraft={draft}
      draftId={draftId}
      onClose={() => router.push('/cases')}
      onSaved={async () => {
        clearCaseDraft(draftId);
        router.push('/cases');
      }}
    />
  );
}
