'use client';

import { useSyncExternalStore } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { identityDraftKey, type LoginIdentityDraft } from '@/features/login-identities/draft';
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
      onSaved={async (saved) => {
        clearCaseDraft(draftId);
        if (draft.returnLoginIdentityDraft && saved) {
          const rawIdentity = sessionStorage.getItem(
            identityDraftKey(draft.returnLoginIdentityDraft),
          );

          if (rawIdentity) {
            const identity = JSON.parse(rawIdentity) as LoginIdentityDraft;

            sessionStorage.setItem(
              identityDraftKey(draft.returnLoginIdentityDraft),
              JSON.stringify({
                ...identity,
                loginTestId: saved.id,
                inputs: { ...saved.target?.inputs, ...identity.inputs },
              }),
            );
            const returnUrl = new URL(
              identity.returnTo || '/settings#login-identities',
              window.location.origin,
            );

            if (returnUrl.origin === window.location.origin) {
              returnUrl.searchParams.set('loginIdentityDraft', draft.returnLoginIdentityDraft);
              router.push(`${returnUrl.pathname}${returnUrl.search}${returnUrl.hash}`);

              return;
            }
          }
        }

        router.push('/cases');
      }}
    />
  );
}
