import type { InputRefs } from '@/automation/platform/inputs';
import type { TestCase } from '@/features/test-cases/types';

export type LoginIdentity = {
  id: string;
  name: string;
  website: string;
  loginTestId: string;
  checkUrl: string;
  successText: string;
  inputs: InputRefs;
  ttlMinutes: number;
  version: number;
  status: 'unverified' | 'verifying' | 'ready' | 'failed' | 'expired';
  lastVerifiedAt: string | null;
  lastError: string | null;
  verificationRunId: string | null;
  references: { id: string; name: string }[];
};
export type LoginIdentitiesResponse = {
  identities: LoginIdentity[];
  flows: Pick<TestCase, 'id' | 'name' | 'url' | 'target'>[];
};
export type LoginPreparation = {
  identityId: string;
  name: string;
  version: number;
  reused: boolean;
};
