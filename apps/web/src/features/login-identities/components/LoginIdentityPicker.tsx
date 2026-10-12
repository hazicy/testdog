'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { LoginIdentityForm } from '@/features/login-identities/components/LoginIdentityForm';
import {
  useLoginIdentities,
  useResumedIdentityDraft,
} from '@/features/login-identities/hooks/useLoginIdentities';
import { sameWebsite } from '@testdog/contracts/login-identities/inputs';
import { identityStatuses } from '@/features/login-identities/presentation';
import { IdentityFeedback } from '@/features/login-identities/components/IdentityFeedback';

export function LoginIdentityPicker({
  value,
  website,
  disabled,
  onChange,
}: {
  value: string;
  website: string;
  disabled: boolean;
  onChange: (id: string) => void;
}) {
  const { data, error, mutate } = useLoginIdentities();
  const [creating, setCreating] = useState(false);
  const [resumed, setResumed] = useResumedIdentityDraft();
  const identities =
    data?.identities.filter((identity) => sameWebsite(identity.website, website)) ?? [];
  const selected = identities.find((identity) => identity.id === value);

  return (
    <div className="space-y-2">
      <label className="block text-sm">登录身份</label>
      <Select
        aria-label="登录身份"
        value={value}
        disabled={disabled || !data}
        onValueChange={(id) => (id === '__new__' ? setCreating(true) : onChange(id))}
        items={[
          { value: '', label: '不使用登录身份' },
          identities.map((identity) => ({
            value: identity.id,
            label: `${identity.name} · ${identityStatuses[identity.status]}`,
          })),
          !!value && !selected && { value, label: '所选登录身份不可用，请重新选择' },
          { value: '__new__', label: '＋ 新建登录身份', disabled: !sameWebsite(website, website) },
        ]}
      />
      {!data && !error && (
        <p role="status" className="text-xs text-page-muted">
          正在加载登录身份…
        </p>
      )}
      {data && value && !selected && (
        <p role="alert" className="text-xs text-error-ink">
          所选身份不存在或与当前网站不匹配，请重新选择。
        </p>
      )}
      {selected ? (
        <IdentityFeedback identity={selected} />
      ) : (
        !value && (
          <p className="text-xs text-page-muted">
            从未登录状态开始；测试登录或退出流程时选择此项。
          </p>
        )
      )}
      {error && (
        <p role="alert" className="text-xs text-error-ink">
          登录身份加载失败。
          <Button type="button" size="sm" onClick={() => void mutate()}>
            重试
          </Button>
        </p>
      )}
      <Link href="/settings#login-identities" className="text-xs text-brand-active">
        管理登录身份
      </Link>
      {(creating || resumed) && data && (
        <LoginIdentityForm
          initial={resumed}
          website={website}
          catalog={data}
          onDismiss={() => {
            setCreating(false);
            setResumed(undefined);
          }}
          onSaved={async (identity, runId) => {
            await mutate(
              {
                ...data,
                identities: [
                  ...data.identities.filter((item) => item.id !== identity.id),
                  {
                    ...identity,
                    status: runId ? 'verifying' : 'unverified',
                    verificationRunId: runId ?? null,
                    verificationStatus: runId ? 'queued' : undefined,
                  },
                ],
              },
              { revalidate: true },
            );
            onChange(identity.id);
            setCreating(false);
            setResumed(undefined);
          }}
        />
      )}
    </div>
  );
}
