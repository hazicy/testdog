'use client';

import { useTranslations } from 'next-intl';

import styles from './BrowserlessForm.module.css';

import { useId, useState } from 'react';
import { Dialog, DialogHeader } from '@/components/ui/Dialog';
import { useToastManager } from '@/components/ui/Toast';
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
  const t = useTranslations('integrations');
  const titleId = useId();
  const [state, setState] = useState(integration);
  const [endpoint, setEndpoint] = useState('');
  const [token, setToken] = useState('');
  const [clearToken, setClearToken] = useState(false);
  const [enabled, setEnabled] = useState(integration.enabled);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toastManager = useToastManager();

  async function save(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');

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
      toastManager.add({ title: t('saved'), type: 'success' });
      await onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setError('');

    try {
      const result = await api
        .post('/api/integrations/browser-providers/browserless/test', {
          timeout: 60000,
          totalTimeout: 60000,
          retry: 0,
        })
        .json<{ browserVersion: string }>();

      toastManager.add({
        title: t('connectionSuccess', { version: result.browserVersion }),
        type: 'success',
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('connectionFailed'));
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
            {state.configured
              ? state.enabled
                ? t('enabled')
                : t('configuredDisabled')
              : t('unconfigured')}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          aria-label={t('closeConfig')}
          disabled={busy}
          onClick={onDismiss}
        >
          {t('close')}
        </Button>
      </DialogHeader>
      <form className={styles.form} onSubmit={save} onChange={() => setDirty(true)}>
        <p className={styles.connectionHint}>{t('browserlessSetup')}</p>
        {state.configurationError && (
          <p role="alert" className={styles.error}>
            {state.configurationError}
          </p>
        )}
        <div>
          <label htmlFor={`${titleId}-endpoint`} className={styles.field}>
            {t('websocket')}
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
                ? t('keepAddress')
                : 'wss://production-sfo.browserless.io/chromium/playwright'
            }
          />
        </div>
        <div>
          <label htmlFor={`${titleId}-token`} className={styles.field}>
            {t('token')}
          </label>
          <Input
            id={`${titleId}-token`}
            type="password"
            autoComplete="new-password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder={state.hasCredentials ? t('keepToken') : t('tokenHint')}
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
            {t('clearToken')}
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
          {t('enableBrowserless')}
        </label>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        <div className={styles.container}>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? t('processing') : t('save')}
          </Button>
          <Button
            type="button"
            disabled={busy || !state.configured || dirty}
            onClick={() => void test()}
          >
            {t('testConnection')}
          </Button>
        </div>
        {dirty && state.configured && (
          <p className={styles.unsavedHint}>{t('saveBeforeConnection')}</p>
        )}
      </form>
    </Dialog>
  );
}
