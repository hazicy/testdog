import { InputRefsSchema, type InputRefs } from '@testdog/contracts/automation/platform/inputs';
import { z } from 'zod';

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
const draftSchema = z.object({
  id: z.uuid().optional(),
  name: z.string(),
  website: z.string(),
  loginTestId: z.string(),
  checkUrl: z.string(),
  successText: z.string(),
  ttlMinutes: z.number(),
  version: z.number(),
  inputs: InputRefsSchema,
  configuredSecrets: z.array(z.string()).optional(),
  returnTo: z.string().optional(),
});

export function resumeIdentityDraft() {
  const url = new URL(window.location.href);
  const key = url.searchParams.get('loginIdentityDraft');

  if (!key) return;
  const raw = sessionStorage.getItem(identityDraftKey(key));

  try {
    return raw ? draftSchema.parse(JSON.parse(raw)) : undefined;
  } catch {
    return;
  } finally {
    url.searchParams.delete('loginIdentityDraft');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    sessionStorage.removeItem(identityDraftKey(key));
  }
}
