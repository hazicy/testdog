'use client';

import { EmptyState } from '@/components/shared/EmptyState';
import { LoadingState } from '@/components/shared/LoadingState';

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

  if (raw === undefined) return <LoadingState message="正在打开画板…" />;
  const draft = readCaseDraft(draftId);

  if (!draft)
    return <EmptyState title="当前草稿不可用" actions={<Link href="/cases">返回用例列表</Link>} />;

  return (
    <TestEditor
      key={draftId}
      test={draft.test}
      duplicate={draft.duplicate}
      initialDraft={draft}
      draftId={draftId}
      onSaved={async () => {
        clearCaseDraft(draftId);
        router.push('/cases');
      }}
    />
  );
}
