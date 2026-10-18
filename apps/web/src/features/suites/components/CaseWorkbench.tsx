'use client';

import { useContext } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import useSWR, { useSWRConfig } from 'swr';
import { fetchJson } from '@/client/api';
import { Workspace } from '@/features/workspace/components/Workspace';
import { TestEditor } from '@/features/test-cases/components/TestEditor';
import { readCaseDraft, clearCaseDraft } from '@/features/test-cases/lib/caseDraft';
import { LoadingState } from '@/components/shared/LoadingState';
import { ErrorState } from '@/components/shared/ErrorState';
import type { TestCase } from '@testdog/contracts/test-cases/types';
import { FolderTreeContext } from '../context';
import { isCaseWorkspaceKey } from '../useFolderTree';

function CaseEditor({ id }: { id: string }) {
  const { mutate } = useSWRConfig();
  const { data, error, mutate: retry } = useSWR<{ test: TestCase }>(`/api/tests/${id}`, fetchJson);
  const t = useTranslations('suites');

  if (error) return <ErrorState message={error.message ?? t('loadFailed')} retry={() => retry()} />;
  if (!data) return <LoadingState />;
  const draftId = `saved-${id}`;

  return (
    <TestEditor
      test={data.test}
      draftId={draftId}
      initialDraft={readCaseDraft(draftId)}
      onSaved={async () => {
        clearCaseDraft(draftId);
        await mutate(isCaseWorkspaceKey);
      }}
    />
  );
}

export function CaseWorkbench() {
  const params = useSearchParams();
  const tree = useContext(FolderTreeContext);
  const folderId = params.get('folder');
  const caseId = params.get('case');
  const folder = tree?.folders.find((item) => item.id === folderId);
  const t = useTranslations('suites');
  const ui = useTranslations('ui');

  if (caseId) return <CaseEditor key={caseId} id={caseId} />;
  if (folderId && !tree) return <LoadingState />;
  if (folderId && !folder) return <ErrorState message={t('folderMissing')} />;

  return (
    <>
      <Workspace
        key={folderId ?? 'root'}
        view="tests"
        folderId={folderId}
        title={folder?.name ?? ui('test_cases')}
      />
    </>
  );
}
