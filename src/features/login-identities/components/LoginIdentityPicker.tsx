'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { fetchJson } from '@/client/api';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { LoginIdentityForm } from './LoginIdentityForm';
import { resumeIdentityDraft, type LoginIdentityDraft } from '../draft';
import type { LoginIdentitiesResponse } from '../types';

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
  const { data, error, mutate } = useSWR<LoginIdentitiesResponse>(
    '/api/login-identities',
    fetchJson,
    { revalidateOnFocus: false },
  );
  const [creating, setCreating] = useState(false);
  const [resumed, setResumed] = useState<LoginIdentityDraft>();

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const draft = resumeIdentityDraft();

      if (draft) {
        setResumed(draft);
        setCreating(true);
      }
    });

    return () => cancelAnimationFrame(frame);
  }, []);
  const identities =
    data?.identities.filter((identity) => {
      try {
        return new URL(identity.website).origin === new URL(website).origin;
      } catch {
        return identity.id === value;
      }
    }) ?? [];

  return (
    <div className="space-y-2">
      <label className="block text-sm">登录身份</label>
      <Select
        aria-label="登录身份"
        value={value}
        disabled={disabled}
        onValueChange={(id) => (id === '__new__' ? setCreating(true) : onChange(id))}
        items={[
          { value: '', label: '不使用登录身份' },
          identities.map((identity) => ({ value: identity.id, label: identity.name })),
          !!value &&
            !identities.some((item) => item.id === value) && {
              value,
              label: '所选登录身份不可用，请重新选择',
            },
          { value: '__new__', label: '＋ 新建登录身份', disabled: !data },
        ]}
      />
      <p className="text-xs text-page-muted">
        {value
          ? '执行前自动准备登录，失效时重新登录。'
          : '从未登录状态开始；测试登录或退出流程时选择此项。'}
      </p>
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
      {creating && data && (
        <LoginIdentityForm
          initial={resumed}
          website={website}
          catalog={data}
          onDismiss={() => {
            setCreating(false);
            setResumed(undefined);
          }}
          onSaved={async (identity) => {
            await mutate();
            onChange(identity.id);
            setCreating(false);
            setResumed(undefined);
          }}
        />
      )}
    </div>
  );
}
