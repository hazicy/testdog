import type { InputRefs } from '@/automation/platform/inputs';

export type LoginIdentityDraft = {
  id?: string;
  name: string;
  website: string;
  loginTestId: string;
  checkUrl: string;
  successText: string;
  ttlMinutes: number;
  version: number;
  inputs: InputRefs;
  configuredSecrets?: string[];
  returnTo?: string;
};
export const identityDraftKey = (id: string) => `caseforge:login-identity-draft:${id}`;

export function resumeIdentityDraft() {
  const url = new URL(window.location.href);
  const key = url.searchParams.get('loginIdentityDraft');

  if (!key) return;
  const raw = sessionStorage.getItem(identityDraftKey(key));

  if (!raw) return;
  try {
    const draft = JSON.parse(raw) as LoginIdentityDraft;

    url.searchParams.delete('loginIdentityDraft');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    sessionStorage.removeItem(identityDraftKey(key));

    return draft;
  } catch {
    return;
  }
}
