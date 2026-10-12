'use client';

import Link from 'next/link';
import type { LoginIdentity } from '../types';
import { identityStatuses, verificationHint } from '../presentation';

export function IdentityFeedback({ identity }: { identity: LoginIdentity }) {
  return (
    <div className="space-y-1 text-xs text-page-muted" role="status">
      <p>
        {identityStatuses[identity.status]} · {verificationHint(identity)}
      </p>
      {identity.verificationRunId && (
        <Link href={`/runs/${identity.verificationRunId}`} className="text-brand-active underline">
          查看验证执行
        </Link>
      )}
    </div>
  );
}
