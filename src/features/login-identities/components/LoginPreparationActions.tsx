'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { useRunSubmission } from '@/client/useRunSubmission';

export function LoginPreparationActions({ identityId }: { identityId: string }) {
  const submit = useRunSubmission();
  const [busy, setBusy] = useState(false);
  const [runId, setRunId] = useState<string>();
  const [error, setError] = useState('');

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Link
        href={`/settings?loginIdentity=${encodeURIComponent(identityId)}#login-identities`}
        className="underline"
      >
        修正登录身份
      </Link>
      <Button
        type="button"
        size="sm"
        disabled={busy || !!runId}
        onClick={async () => {
          setBusy(true);
          setError('');
          try {
            const result = await submit<{ runId: string }>(
              `/api/login-identities/${identityId}/verify`,
              {},
            );

            setRunId(result.runId);
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : '提交验证失败。');
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? '正在提交…' : runId ? '验证已提交' : '重新验证'}
      </Button>
      {runId && (
        <Link href={`/runs/${runId}`} className="underline">
          查看验证执行
        </Link>
      )}
      {error && (
        <span role="alert" className="text-error-ink">
          {error}
        </span>
      )}
    </span>
  );
}
