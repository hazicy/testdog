'use client';

import { useSyncExternalStore } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { identityDraftKey, type LoginIdentityDraft } from '@/features/login-identities/draft';
import { reconcileInputs } from '@/features/login-identities/inputs';
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

  function returnToIdentity(saved?: import('@/features/test-cases/types').TestCase) {
    if (!draft?.returnLoginIdentityDraft) return false;
    const rawIdentity = sessionStorage.getItem(identityDraftKey(draft.returnLoginIdentityDraft));

    if (!rawIdentity) return false;
    try {
      const identity = JSON.parse(rawIdentity) as LoginIdentityDraft;
      const returnUrl = new URL(
        identity.returnTo || '/settings#login-identities',
        window.location.origin,
      );

      if (returnUrl.origin !== window.location.origin) return false;
      sessionStorage.setItem(
        identityDraftKey(draft.returnLoginIdentityDraft),
        JSON.stringify({
          ...identity,
          ...(saved
            ? {
                loginTestId: saved.id,
                inputs: reconcileInputs(saved.target?.inputs, identity.inputs),
              }
            : {}),
        }),
      );
      returnUrl.searchParams.set('loginIdentityDraft', draft.returnLoginIdentityDraft);
      router.push(`${returnUrl.pathname}${returnUrl.search}${returnUrl.hash}`);

      return true;
    } catch {
      return false;
    }
  }

  return (
    <TestEditor
      key={draftId}
      test={draft.test}
      duplicate={draft.duplicate}
      initialDraft={draft}
      draftId={draftId}
      onCancel={() => {
        clearCaseDraft(draftId);
        if (!returnToIdentity()) router.push('/cases');
      }}
      onSaved={async (saved) => {
        clearCaseDraft(draftId);
        if (returnToIdentity(saved)) return;
        router.push('/cases');
      }}
    />
  );
}
