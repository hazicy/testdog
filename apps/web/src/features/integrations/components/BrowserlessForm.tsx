'use client';

import styles from './BrowserlessForm.module.css';

import { useId, useState } from 'react';
import { Dialog, DialogHeader } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Checkbox } from '@/components/ui/Checkbox';
import { api } from '@/client/api';
import type { BrowserProviderIntegration } from '@testdog/contracts/integrations/types';

export function BrowserlessForm({
  integration,
  onSaved,
  onDismiss,
}: {
  integration: BrowserProviderIntegration;
  onSaved: () => Promise<unknown>;
  onDismiss: () => void;
}) {
  const titleId = useId();
  const [state, setState] = useState(integration);
  const [endpoint, setEndpoint] = useState('');
  const [token, setToken] = useState('');
  const [clearToken, setClearToken] = useState(false);
  const [enabled, setEnabled] = useState(integration.enabled);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await api
        .put('/api/integrations/browser-providers/browserless', {
          json: {
            version: state.version,
            enabled,
            clearToken,
            ...(endpoint.trim() ? { endpoint: endpoint.trim() } : {}),
            ...(token.trim() ? { token: token.trim() } : {}),
          },
        })
        .json<{ integration: BrowserProviderIntegration }>();

      setState(result.integration);
      setEndpoint('');
      setToken('');
      setClearToken(false);
      setDirty(false);
      setMessage('配置已保存。');
      await onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败');
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await api
        .post('/api/integrations/browser-providers/browserless/test', {
          timeout: 60000,
          totalTimeout: 60000,
          retry: 0,
        })
        .json<{ browserVersion: string }>();

      setMessage(`连接测试成功，浏览器版本：${result.browserVersion}。`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '连接测试失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog titleId={titleId} busy={busy} onDismiss={onDismiss} initialFocus="input">
      <DialogHeader>
        <div>
          <h2 id={titleId} className={styles.heading}>
            Browserless
          </h2>
          <p className={styles.subtitle}>
            {state.configured ? (state.enabled ? '已启用' : '已配置 · 未启用') : '未配置'}
          </p>
        </div>
        <Button variant="ghost" size="sm" aria-label="关闭配置" disabled={busy} onClick={onDismiss}>
          关闭
        </Button>
      </DialogHeader>
      <form className={styles.form} onSubmit={save} onChange={() => setDirty(true)}>
        <p className={styles.connectionHint}>
          用于 Web Chromium 执行，WebKit 仍使用本地浏览器。请填写 Playwright 原生协议的
          /chromium/playwright 端点，服务端需兼容 Playwright 1.63.0。启用后连接失败将终止执行。
        </p>
        {state.configurationError && (
          <p role="alert" className={styles.error}>
            {state.configurationError}
          </p>
        )}
        <div>
          <label htmlFor={`${titleId}-endpoint`} className={styles.field}>
            WebSocket 地址
          </label>
          <Input
            id={`${titleId}-endpoint`}
            type="password"
            autoComplete="new-password"
            value={endpoint}
            required={!state.configured}
            onChange={(event) => setEndpoint(event.target.value)}
            placeholder={
              state.configured
                ? '已保存，留空保留原地址'
                : 'wss://production-sfo.browserless.io/chromium/playwright'
            }
          />
        </div>
        <div>
          <label htmlFor={`${titleId}-token`} className={styles.field}>
            Token（可选）
          </label>
          <Input
            id={`${titleId}-token`}
            type="password"
            autoComplete="new-password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder={
              state.hasCredentials
                ? '已保存，留空保留原 Token'
                : '云服务 API Token；自部署无认证时可留空'
            }
          />
        </div>
        {state.hasCredentials && (
          <label className={styles.clearCredential}>
            <Checkbox
              checked={clearToken}
              onCheckedChange={(value) => {
                setClearToken(value);
                setDirty(true);
              }}
            />
            清除已保存的 Token
          </label>
        )}
        <label className={styles.clearCredential}>
          <Checkbox
            checked={enabled}
            onCheckedChange={(value) => {
              setEnabled(value);
              setDirty(true);
            }}
          />
          启用 Browserless
        </label>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        {message && (
          <p role="status" className={styles.loading}>
            {message}
          </p>
        )}
        <div className={styles.container}>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? '处理中…' : '保存配置'}
          </Button>
          <Button
            type="button"
            disabled={busy || !state.configured || dirty}
            onClick={() => void test()}
          >
            测试连接
          </Button>
        </div>
        {dirty && state.configured && (
          <p className={styles.unsavedHint}>先保存修改，再测试连接。</p>
        )}
      </form>
    </Dialog>
  );
}
