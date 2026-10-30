'use client';

import { useTranslations } from 'next-intl';
import { useIssueLabels } from '@/features/issues/presentation';

import styles from './IssueEditor.module.css';

import { Input } from '@/components/ui/Input';
import { useId, useState } from 'react';
import { Dialog, DialogHeader, DialogFooter } from '@/components/ui/Dialog';
import { Icon } from '@iconify/react/offline';
import closeIcon from '@iconify-icons/lucide/x';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { api } from '@/client/api';
import { useRunSubmission } from '@/client/useRunSubmission';
import { type Issue, type IssuePage } from '@testdog/contracts/issues/types';
import type { ExecutionStep, TestRun } from '@testdog/contracts/runs/types';
import useSWR from 'swr';
import { fetchJson } from '@/client/api';
import { issueTitle } from '../lib/issueTitle';

export const options = (values: Record<string, string>) =>
  Object.entries(values).map(([value, label]) => ({ value, label }));

export function IssueEditor({
  issue,
  run,
  step,
  onDismiss,
  onSaved,
}: {
  issue?: Issue;
  run?: TestRun;
  step?: ExecutionStep;
  onDismiss: () => void;
  onSaved: (issue: Issue) => void;
}) {
  const t = useTranslations('issues');
  const { issueStatuses, issueSeverities, closeReasons } = useIssueLabels();
  const titleId = useId();
  const [baseVersion] = useState(issue?.version);
  const submit = useRunSubmission();
  const [mode, setMode] = useState<'create' | 'link'>('create');
  const [title, setTitle] = useState(() => issue?.title ?? issueTitle(run, step));
  const [severity, setSeverity] = useState(issue?.severity ?? 'medium');
  const [status, setStatus] = useState(issue?.status ?? 'open');
  const [reason, setReason] = useState(issue?.closeReason ?? 'fixed');
  const [search, setSearch] = useState('');
  const [chosen, setChosen] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { data: page, error: pageError } = useSWR<IssuePage>(
    mode === 'link' ? `/api/issues?q=${encodeURIComponent(search)}` : null,
    fetchJson,
  );

  async function save(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'link' && run) {
        if (!chosen) throw new Error(t('selectIssue'));
        await api.post(`/api/issues/${chosen}/occurrences`, {
          json: { runId: run.id, stepId: step?.id },
        });
        const linked = page?.issues.find((item) => item.id === chosen);

        if (linked) onSaved(linked);
      } else if (issue) {
        const response = await api
          .patch(`/api/issues/${issue.id}`, {
            json: {
              version: baseVersion,
              title,
              severity,
              status,
              ...(status === 'closed' ? { closeReason: reason } : {}),
            },
          })
          .json<{ issue: Issue }>();

        onSaved(response.issue);
      } else {
        const response = await submit<{ issue: Issue }>('/api/issues', {
          title,
          severity,
          ...(run ? { source: { runId: run.id, stepId: step?.id } } : {}),
        });

        onSaved(response.issue);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog titleId={titleId} busy={busy} onDismiss={onDismiss} initialFocus="input">
      <form onSubmit={save}>
        <DialogHeader>
          <h2 id={titleId} className={styles.heading}>
            {issue ? t('editIssue') : t('createOrLink')}
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t('closeEditor')}
            disabled={busy}
            onClick={onDismiss}
          >
            <Icon icon={closeIcon} width="18" aria-hidden="true" />
          </Button>
        </DialogHeader>
        <div className={styles.container}>
          {run && (
            <p className={styles.description}>
              {t('source', { name: run.name, step: step ? ` / ${step.title}` : '' })}
            </p>
          )}
          {run && !issue && (
            <div className={styles.group} role="group" aria-label={t('issueActions')}>
              <Button
                type="button"
                aria-pressed={mode === 'create'}
                onClick={() => setMode('create')}
              >
                {t('createNew')}
              </Button>
              <Button type="button" aria-pressed={mode === 'link'} onClick={() => setMode('link')}>
                {t('linkExisting')}
              </Button>
            </div>
          )}
          {mode === 'link' ? (
            <>
              <label className={styles.field}>
                {t('search')}
                <Input
                  className={styles.input}
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setChosen('');
                  }}
                  maxLength={200}
                />
              </label>
              <Select
                aria-label={t('chooseExisting')}
                value={chosen}
                onValueChange={setChosen}
                items={[
                  { value: '', label: t('chooseIssue') },
                  ...(page?.issues.map((item) => ({
                    value: item.id,
                    label: `${issueStatuses[item.status]} · ${item.title}`,
                  })) ?? []),
                ]}
              />
            </>
          ) : (
            <>
              <label className={styles.field}>
                {t('issueTitle')}
                <Input
                  className={styles.input}
                  required
                  maxLength={200}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </label>
              <Select
                aria-label={t('severity')}
                value={severity}
                onValueChange={(value) => setSeverity(value as typeof severity)}
                items={options(issueSeverities)}
              />
              {issue && (
                <Select
                  aria-label={t('issueStatus')}
                  value={status}
                  onValueChange={(value) => setStatus(value as typeof status)}
                  items={options(issueStatuses)}
                />
              )}
              {issue && status === 'closed' && (
                <Select
                  aria-label={t('closeReason')}
                  value={reason}
                  onValueChange={(value) => setReason(value as typeof reason)}
                  items={options(closeReasons)}
                />
              )}
            </>
          )}
          {(error || (mode === 'link' && pageError)) && (
            <p role="alert" className={styles.error}>
              {error || pageError?.message}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" disabled={busy} onClick={onDismiss}>
            {t('cancel')}
          </Button>
          <Button type="submit" variant="primary" disabled={busy || (mode === 'link' && !chosen)}>
            {busy ? t('saving') : mode === 'link' ? t('linkIssue') : t('saveIssue')}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
