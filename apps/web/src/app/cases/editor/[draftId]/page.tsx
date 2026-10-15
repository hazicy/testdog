'use client';

import { useTranslations } from 'next-intl';

import { EmptyState } from '@/components/shared/EmptyState';
import { LoadingState } from '@/components/shared/LoadingState';

import { useSyncExternalStore } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { TestEditor } from '@/features/test-cases/components/TestEditor';
import { clearCaseDraft, readCaseDraft } from '@/features/test-cases/lib/caseDraft';

export default function CaseCanvasPage() {
  const t = useTranslations('editor');
  const { draftId } = useParams<{ draftId: string }>();
  const router = useRouter();
  const raw = useSyncExternalStore(
    () => () => {},
    () => sessionStorage.getItem(`testdog:case-draft:${draftId}`),
    () => undefined,
  );

  if (raw === undefined) return <LoadingState message={t('openingCanvas')} />;
  const draft = readCaseDraft(draftId);

  if (!draft)
    return (
      <EmptyState
        message={t('draftUnavailable')}
        actions={<Link href="/cases">{t('backToCases')}</Link>}
      />
    );

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
