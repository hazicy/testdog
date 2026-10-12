'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogHeader } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { api } from '@/client/api';
import { useRunSubmission } from '@/client/useRunSubmission';
import { writeCaseDraft } from '@/features/test-cases/lib/caseDraft';
import { emptyPlan } from '@/features/test-cases/lib/authoring';
import { initialCaseSettings } from '@/features/test-cases/lib/caseSettings';
import { identityDraftKey, type LoginIdentityDraft } from '../draft';
import type { LoginIdentity, LoginIdentitiesResponse } from '../types';

export function LoginIdentityForm({
  initial,
  website = '',
  catalog,
  onSaved,
  onDismiss,
}: {
  initial?: LoginIdentityDraft;
  website?: string;
  catalog: LoginIdentitiesResponse;
  onSaved: (identity: LoginIdentity) => Promise<unknown>;
  onDismiss: () => void;
}) {
  const titleId = useId();
  const router = useRouter();
  const submit = useRunSubmission();
  const [draft, setDraft] = useState<LoginIdentityDraft>(
    initial ?? {
      name: '',
      website,
      checkUrl: website,
      loginTestId: '',
      successText: '',
      ttlMinutes: 60,
      version: 0,
      inputs: {},
    },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const flows = catalog.flows.filter((flow) => {
    try {
      return !draft.website || new URL(flow.url).origin === new URL(draft.website).origin;
    } catch {
      return false;
    }
  });
  const selectedFlow = catalog.flows.find((flow) => flow.id === draft.loginTestId);

  function patch(value: Partial<LoginIdentityDraft>) {
    setDraft((current) => ({ ...current, ...value }));
  }

  function editFlow(id?: string) {
    const key = crypto.randomUUID();
    const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;

    sessionStorage.setItem(identityDraftKey(key), JSON.stringify({ ...draft, returnTo }));
    const editorId = crypto.randomUUID();

    if (id) {
      const flow = catalog.flows.find((item) => item.id === id);

      if (!flow) return;
      // Load the complete case before opening the existing canvas.
      void api
        .get(`/api/tests/${id}`)
        .json<{ test: import('@/features/test-cases/types').TestCase }>()
        .then(({ test }) => {
          writeCaseDraft(editorId, {
            test,
            name: test.name,
            url: test.url,
            goal: test.goal,
            plan: test.plan ?? emptyPlan(test.name),
            returnLoginIdentityDraft: key,
          });
          router.push(`/cases/editor/${editorId}`);
        })
        .catch((cause) => setError(cause instanceof Error ? cause.message : '无法打开流程'));
    } else {
      const name = draft.name ? `${draft.name} · 登录流程` : '登录流程';

      writeCaseDraft(editorId, {
        name,
        url: draft.website,
        goal: '',
        plan: emptyPlan(name),
        settings: {
          ...initialCaseSettings(),
          url: draft.website,
          webProfile: 'legacy-desktop',
          inputRefs: JSON.stringify(draft.inputs, null, 2),
        },
        returnLoginIdentityDraft: key,
      });
      router.push(`/cases/editor/${editorId}`);
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    event.stopPropagation();
    setBusy(true);
    setError('');
    try {
      const { id } = draft;
      const json = {
        name: draft.name,
        website: draft.website,
        loginTestId: draft.loginTestId,
        checkUrl: draft.checkUrl,
        successText: draft.successText,
        ttlMinutes: draft.ttlMinutes,
        version: draft.version,
        inputs: draft.inputs,
      };
      const result = await (
        id
          ? api.patch(`/api/login-identities/${id}`, { json })
          : api.post('/api/login-identities', { json })
      ).json<{ identity: LoginIdentity }>();

      patch({ id: result.identity.id, version: result.identity.version });
      setSaved(true);
      await submit(`/api/login-identities/${result.identity.id}/verify`, {});
      await onSaved(result.identity);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存或提交验证失败');
    } finally {
      setBusy(false);
    }
  }

  const field = (
    label: string,
    key: 'name' | 'website' | 'checkUrl' | 'successText',
    placeholder: string,
    type = 'text',
  ) => (
    <label className="block space-y-2 text-sm">
      <span>{label}</span>
      <Input
        required
        type={type}
        value={draft[key]}
        placeholder={placeholder}
        disabled={busy}
        onChange={(event) => patch({ [key]: event.target.value })}
      />
    </label>
  );

  return (
    <Dialog titleId={titleId} busy={busy} onDismiss={onDismiss} initialFocus="input">
      <DialogHeader>
        <h2 id={titleId} className="text-base font-semibold">
          {draft.id ? '编辑登录身份' : '新建登录身份'}
        </h2>
        <Button variant="ghost" size="sm" disabled={busy} onClick={onDismiss}>
          关闭
        </Button>
      </DialogHeader>
      <form className="space-y-4 p-6" onSubmit={save}>
        {field('身份名称', 'name', '例如：测试环境管理员')}
        {field('网站', 'website', 'https://test.example.com', 'url')}
        <div className="space-y-2">
          <label className="block text-sm">登录流程</label>
          <Select
            aria-label="登录流程"
            value={draft.loginTestId}
            disabled={busy}
            required
            onValueChange={(value) => {
              const flow = catalog.flows.find((item) => item.id === value);

              patch({ loginTestId: value, inputs: flow?.target?.inputs ?? {} });
            }}
            items={[
              { value: '', label: '选择已保存的登录流程' },
              flows.map((flow) => ({ value: flow.id, label: flow.name })),
            ]}
          />
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={busy || !draft.website}
              onClick={() => editFlow()}
            >
              新建登录流程
            </Button>
            {selectedFlow && (
              <Button
                type="button"
                size="sm"
                disabled={busy}
                onClick={() => editFlow(selectedFlow.id)}
              >
                编辑登录流程
              </Button>
            )}
          </div>
          <p className="text-xs text-page-muted">
            使用现有画板编写登录操作。流程保存后会回到这里，当前填写内容会保留。
          </p>
        </div>
        {Object.entries(draft.inputs).length === 0 && (
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() =>
              patch({
                inputs: { username: { value: '' }, password: { secretRef: 'LOGIN_PASSWORD' } },
              })
            }
          >
            添加账号与密码输入
          </Button>
        )}
        {Object.entries(draft.inputs).length > 0 && (
          <fieldset className="space-y-3">
            <legend className="mb-2 text-sm font-medium">账号与输入</legend>
            {Object.entries(draft.inputs).map(([key, input]) => (
              <label key={key} className="block space-y-2 text-sm">
                <span>
                  {key}
                  {'secretRef' in input ? '（密钥名称）' : ''}
                </span>
                <Input
                  value={'secretRef' in input ? input.secretRef : input.value}
                  disabled={busy}
                  onChange={(event) =>
                    patch({
                      inputs: {
                        ...draft.inputs,
                        [key]:
                          'secretRef' in input
                            ? { secretRef: event.target.value }
                            : { value: event.target.value },
                      },
                    })
                  }
                />
              </label>
            ))}
            <p className="text-xs text-page-muted">
              密码使用已配置的密钥名称，例如
              LOGIN_PASSWORD。不同身份可以引用同一流程并使用不同账号。
            </p>
          </fieldset>
        )}
        {field('登录后验证页面', 'checkUrl', 'https://test.example.com/dashboard', 'url')}
        {field('登录成功标志（页面文字）', 'successText', '例如：退出登录')}
        <p className="text-xs text-page-muted">
          填写只在登录后出现的文字。每次执行前都会检查；失效时自动重新登录。
        </p>
        <label className="block space-y-2 text-sm">
          <span>登录态有效期（分钟）</span>
          <Input
            type="number"
            required
            min={1}
            max={1440}
            value={draft.ttlMinutes}
            disabled={busy}
            onChange={(event) => patch({ ttlMinutes: Number(event.target.value) })}
          />
        </label>
        {saved && (
          <p role="status" className="text-sm text-page-muted">
            配置已保存，验证由执行 worker 完成。
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-error-ink">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" disabled={busy || !draft.loginTestId}>
          {busy ? '处理中…' : '保存并验证'}
        </Button>
      </form>
    </Dialog>
  );
}
