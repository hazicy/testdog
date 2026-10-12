'use client';

import { useId, useState } from 'react';
import { isHTTPError } from 'ky';
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
import { defaultLoginInputs, inputLabel, reconcileInputs, sameWebsite } from '../inputs';
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
  onSaved: (identity: LoginIdentity, runId?: string) => Promise<unknown>;
  onDismiss: () => void;
}) {
  const titleId = useId();
  const router = useRouter();
  const submit = useRunSubmission();
  const [draft, setDraft] = useState<LoginIdentityDraft>(() => {
    const base = initial ?? {
      name: '',
      website,
      checkUrl: website,
      loginTestId: '',
      successText: '',
      ttlMinutes: 60,
      version: 0,
      inputs: {},
    };
    const flow = catalog.flows.find((item) => item.id === base.loginTestId);
    const inputs =
      flow && !base.returnTo ? reconcileInputs(flow.target?.inputs, base.inputs) : base.inputs;

    return {
      ...base,
      inputs,
      configuredSecrets: base.configuredSecrets?.filter(
        (key) =>
          inputs[key] &&
          'secretRef' in inputs[key] &&
          inputs[key].secretRef.startsWith('IDENTITY_'),
      ),
    };
  });
  const [step, setStep] = useState(initial?.returnTo && initial.loginTestId ? 1 : 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [savedIdentity, setSavedIdentity] = useState<LoginIdentity>();
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const passwordValue = (key: string) => (Object.hasOwn(passwords, key) ? passwords[key] : '');
  const flows = catalog.flows.filter((flow) => sameWebsite(flow.url, draft.website));
  const selectedFlow = flows.find((flow) => flow.id === draft.loginTestId);

  function patch(value: Partial<LoginIdentityDraft>) {
    setDraft((current) => ({ ...current, ...value }));
    setSavedIdentity(undefined);
    setFieldErrors({});
    setError('');
  }

  function selectFlow(id: string) {
    const flow = flows.find((item) => item.id === id);
    const inputs = reconcileInputs(flow?.target?.inputs, draft.inputs);

    setPasswords({});
    patch({
      loginTestId: id,
      inputs,
      configuredSecrets: (draft.configuredSecrets ?? []).filter(
        (key) =>
          inputs[key] &&
          'secretRef' in inputs[key] &&
          draft.inputs[key] &&
          'secretRef' in draft.inputs[key],
      ),
    });
  }

  async function editFlow(id?: string) {
    setBusy(true);
    setError('');
    try {
      const key = crypto.randomUUID();
      const editorId = crypto.randomUUID();
      const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      const inputs = selectedFlow?.target?.inputs ?? defaultLoginInputs;

      if (id) {
        const { test } = await api
          .get(`/api/tests/${id}`)
          .json<{ test: import('@/features/test-cases/types').TestCase }>();

        writeCaseDraft(editorId, {
          test,
          name: test.name,
          url: test.url,
          goal: test.goal,
          plan: test.plan ?? emptyPlan(test.name),
          returnLoginIdentityDraft: key,
        });
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
            inputRefs: JSON.stringify(inputs),
          },
          returnLoginIdentityDraft: key,
        });
      }

      // Only definitions and previously saved opaque references enter the navigation draft.
      sessionStorage.setItem(identityDraftKey(key), JSON.stringify({ ...draft, returnTo }));
      setPasswords({});
      router.push(`/cases/editor/${editorId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法打开登录流程。');
      setBusy(false);
    }
  }

  function validate(stage: number) {
    const issues: Record<string, string> = {};

    if (stage === 0) {
      if (!draft.name.trim()) issues.name = '请填写身份名称。';
      if (!/^https?:\/\//.test(draft.website) || !sameWebsite(draft.website, draft.website))
        issues.website = '请填写完整的网站地址。';
      if (!selectedFlow) issues.loginTestId = '请选择同一网站的登录流程，或新建流程。';
    }

    if (stage === 1) {
      for (const [key, input] of Object.entries(draft.inputs)) {
        if (
          'secretRef' in input &&
          !passwordValue(key) &&
          !draft.configuredSecrets?.includes(key)
        ) {
          issues[`inputs.${key}`] = `请填写${inputLabel(key, input)}。`;
        }
      }
    }

    if (stage === 2) {
      if (!/^https?:\/\//.test(draft.checkUrl) || !sameWebsite(draft.website, draft.checkUrl))
        issues.checkUrl = '验证页面必须属于同一网站，请填写完整地址。';
      if (!draft.successText.trim())
        issues.successText = '请填写只有登录后才会出现的文字，例如“退出登录”。';
      if (!Number.isInteger(draft.ttlMinutes) || draft.ttlMinutes < 1 || draft.ttlMinutes > 1440)
        issues.ttlMinutes = '有效期应为 1–1440 分钟。';
    }

    setFieldErrors(issues);

    return Object.keys(issues).length === 0;
  }

  async function save(verify: boolean) {
    for (let stage = 0; stage < 3; stage++) {
      if (!validate(stage)) {
        setStep(stage);

        return;
      }
    }

    setBusy(true);
    setError('');
    let identity = savedIdentity;

    try {
      if (!identity) {
        const json = {
          name: draft.name,
          website: draft.website,
          loginTestId: draft.loginTestId,
          checkUrl: draft.checkUrl,
          successText: draft.successText,
          ttlMinutes: draft.ttlMinutes,
          version: draft.version,
          inputs: draft.inputs,
          secrets: Object.fromEntries(
            Object.entries(passwords).filter(([, value]) => value !== ''),
          ),
        };
        const result = await (
          draft.id
            ? api.patch(`/api/login-identities/${draft.id}`, { json })
            : api.post('/api/login-identities', { json })
        ).json<{ identity: LoginIdentity }>();

        identity = result.identity;
        setDraft((current) => ({
          ...current,
          id: identity!.id,
          version: identity!.version,
          inputs: identity!.inputs,
          configuredSecrets: identity!.configuredSecrets,
        }));
        setPasswords({});
        setSavedIdentity(identity);
      }

      const verification = verify
        ? await submit<{ runId: string }>(`/api/login-identities/${identity.id}/verify`, {})
        : undefined;

      await onSaved(identity, verification?.runId);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '操作失败，请重试。';

      setError(identity ? `配置已保存。${message}` : message);
      if (
        isHTTPError(cause) &&
        cause.data &&
        typeof cause.data === 'object' &&
        'fieldErrors' in cause.data
      ) {
        const issues = cause.data.fieldErrors as Record<string, string>;

        setFieldErrors(issues);
        const keys = Object.keys(issues);

        setStep(
          keys.some((key) => ['name', 'website', 'loginTestId'].includes(key))
            ? 0
            : keys.some((key) => key.startsWith('inputs.'))
              ? 1
              : 2,
        );
      }
    } finally {
      setBusy(false);
    }
  }

  function issue(key: string) {
    return (
      fieldErrors[key] && (
        <p id={`${titleId}-${key}`} role="alert" className="text-xs text-error-ink">
          {fieldErrors[key]}
        </p>
      )
    );
  }

  function field(
    label: string,
    key: 'name' | 'website' | 'checkUrl' | 'successText',
    placeholder: string,
    type = 'text',
  ) {
    return (
      <label className="block space-y-2 text-sm">
        <span>{label}</span>
        <Input
          aria-label={label}
          type={type}
          value={draft[key]}
          placeholder={placeholder}
          disabled={busy}
          aria-invalid={!!fieldErrors[key]}
          aria-describedby={fieldErrors[key] ? `${titleId}-${key}` : undefined}
          onChange={(event) => {
            if (key === 'website' && !sameWebsite(event.target.value, draft.website)) {
              setPasswords({});
              patch({
                website: event.target.value,
                loginTestId: '',
                inputs: {},
                configuredSecrets: [],
                checkUrl: draft.checkUrl === draft.website ? event.target.value : draft.checkUrl,
              });
            } else patch({ [key]: event.target.value });
          }}
        />
        {issue(key)}
      </label>
    );
  }

  return (
    <Dialog titleId={titleId} busy={busy} onDismiss={onDismiss} initialFocus="input">
      <DialogHeader>
        <h2 id={titleId} className="text-base font-semibold">
          {draft.id ? '编辑登录身份' : '新建登录身份'}
        </h2>
        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onDismiss}>
          关闭
        </Button>
      </DialogHeader>
      <form
        className="space-y-4 p-6"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (step < 2) {
            if (validate(step)) {
              setError('');
              setStep(step + 1);
            }
          } else void save(true);
        }}
      >
        <nav aria-label="登录身份配置步骤" className="flex gap-2 text-sm">
          {['登录流程', '账号密码', '成功检查'].map((label, index) => (
            <span
              key={label}
              aria-current={step === index ? 'step' : undefined}
              className={step === index ? 'font-semibold text-brand-active' : 'text-page-muted'}
            >
              {index + 1}. {label}
            </span>
          ))}
        </nav>
        {step === 0 && (
          <>
            {field('身份名称', 'name', '例如：测试环境管理员')}
            {field('网站', 'website', 'https://test.example.com', 'url')}
            <div className="space-y-2">
              <label className="block text-sm">登录流程</label>
              <Select
                aria-label="登录流程"
                value={selectedFlow ? draft.loginTestId : ''}
                disabled={busy}
                onValueChange={selectFlow}
                items={[
                  { value: '', label: '选择已保存的登录流程' },
                  flows.map((flow) => ({ value: flow.id, label: flow.name })),
                ]}
              />
              {issue('loginTestId')}
              {!flows.length && (
                <p className="text-xs text-page-muted">
                  该网站还没有可用流程，可以先创建登录步骤。
                </p>
              )}
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={busy || !sameWebsite(draft.website, draft.website)}
                  onClick={() => void editFlow()}
                >
                  新建登录流程
                </Button>
                {selectedFlow && (
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy}
                    onClick={() => void editFlow(selectedFlow.id)}
                  >
                    编辑登录流程
                  </Button>
                )}
              </div>
              <p className="text-xs text-page-muted">
                在画板中编写登录操作，并插入账号、密码。保存返回后填写实际值。
              </p>
            </div>
          </>
        )}
        {step === 1 && (
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">账号与输入</legend>
            {Object.entries(draft.inputs).length === 0 && (
              <p className="text-sm text-page-muted">
                此流程没有可填写的输入。若需要账号密码，请先编辑流程添加输入并在步骤中插入。
              </p>
            )}
            {Object.entries(draft.inputs).map(([key, input]) => (
              <label key={key} className="block space-y-2 text-sm">
                <span>{inputLabel(key, input)}</span>
                <Input
                  aria-label={inputLabel(key, input)}
                  type={'secretRef' in input ? 'password' : 'text'}
                  autoComplete="off"
                  disabled={busy}
                  aria-invalid={!!fieldErrors[`inputs.${key}`]}
                  aria-describedby={
                    fieldErrors[`inputs.${key}`] ? `${titleId}-inputs.${key}` : undefined
                  }
                  placeholder={
                    'secretRef' in input
                      ? draft.configuredSecrets?.includes(key)
                        ? '已保存，留空保持不变'
                        : `请输入${inputLabel(key, input)}`
                      : ''
                  }
                  value={'secretRef' in input ? passwordValue(key) : input.value}
                  onChange={(event) => {
                    if ('secretRef' in input) {
                      setPasswords((current) => ({ ...current, [key]: event.target.value }));
                      setSavedIdentity(undefined);
                      setFieldErrors({});
                      setError('');
                    } else
                      patch({
                        inputs: { ...draft.inputs, [key]: { ...input, value: event.target.value } },
                      });
                  }}
                />
                {issue(`inputs.${key}`)}
              </label>
            ))}
            <p className="text-xs text-page-muted">
              密码加密保存。不同身份可以使用同一流程和不同账号。
            </p>
            {selectedFlow && (
              <Button
                type="button"
                size="sm"
                disabled={busy}
                onClick={() => void editFlow(selectedFlow.id)}
              >
                编辑登录流程
              </Button>
            )}
            {Object.values(passwords).some(Boolean) && (
              <p className="text-xs text-page-muted">进入画板后，尚未保存的密码需要重新填写。</p>
            )}
          </fieldset>
        )}
        {step === 2 && (
          <>
            {field('登录后验证页面', 'checkUrl', 'https://test.example.com/dashboard', 'url')}
            {field('登录成功标志（页面文字）', 'successText', '例如：退出登录')}
            <p className="text-xs text-page-muted">
              使用只有登录后才出现的文字。每次执行前都会检查，失效时自动重新登录。
            </p>
            <details>
              <summary className="cursor-pointer text-sm">高级设置</summary>
              <label className="mt-3 block space-y-2 text-sm">
                <span>登录态有效期（分钟）</span>
                <Input
                  type="number"
                  aria-label="登录态有效期（分钟）"
                  min={1}
                  max={1440}
                  value={draft.ttlMinutes}
                  disabled={busy}
                  onChange={(event) => patch({ ttlMinutes: Number(event.target.value) })}
                />
                {issue('ttlMinutes')}
              </label>
            </details>
          </>
        )}
        {savedIdentity && (
          <p role="status" className="text-sm text-page-muted">
            配置已保存，可重试验证或完成保存。
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-error-ink">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          {step > 0 && (
            <Button
              type="button"
              disabled={busy}
              onClick={() => {
                setStep(step - 1);
                setError('');
                setFieldErrors({});
              }}
            >
              上一步
            </Button>
          )}
          {step === 2 && (
            <Button type="button" disabled={busy} onClick={() => void save(false)}>
              仅保存
            </Button>
          )}
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? '处理中…' : step < 2 ? '下一步' : savedIdentity ? '重试验证' : '保存并验证'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
