'use client';

import { useId, useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { api } from '@/client/api';
import { useRunSubmission } from '@/client/useRunSubmission';
import {
  closeReasons,
  issueCategories,
  issueSeverities,
  issueStatuses,
  type Issue,
  type IssuePage,
} from '../types';
import type { ExecutionStep, TestRun } from '@/features/runs/types';
import useSWR from 'swr';
import { fetchJson } from '@/client/api';

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
  const titleId = useId();
  const [baseVersion] = useState(issue?.version);
  const submit = useRunSubmission();
  const [mode, setMode] = useState<'create' | 'link'>('create');
  const [title, setTitle] = useState(issue?.title ?? step?.title ?? run?.name ?? '');
  const [description, setDescription] = useState(
    issue?.description ??
      [
        step?.assertion?.description ? `预期：${step.assertion.description}` : '',
        step?.evidence ? `验证证据：${step.evidence}` : '',
        (step ? step.error : run?.error) ?? '',
      ]
        .filter(Boolean)
        .join('\n'),
  );
  const [category, setCategory] = useState(issue?.category ?? 'product');
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

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'link' && run) {
        if (!chosen) throw new Error('请选择要关联的问题。');
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
              description,
              category,
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
          description,
          category,
          severity,
          ...(run ? { source: { runId: run.id, stepId: step?.id } } : {}),
        });

        onSaved(response.issue);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog titleId={titleId} busy={busy} onDismiss={onDismiss} initialFocus="input">
      <form onSubmit={save} className="space-y-4">
        <h2 id={titleId} className="text-lg font-semibold">
          {issue ? '编辑问题' : '创建或关联问题'}
        </h2>
        {run && (
          <p className="text-sm text-page-muted">
            来源：{run.name}
            {step ? ` / ${step.title}` : ''}，提交后关联执行和已归档证据。
          </p>
        )}
        {run && !issue && (
          <div className="flex gap-2" role="group" aria-label="问题操作">
            <Button
              type="button"

              aria-pressed={mode === 'create'}
              onClick={() => setMode('create')}
            >
              创建新问题
            </Button>
            <Button
              type="button"

              aria-pressed={mode === 'link'}
              onClick={() => setMode('link')}
            >
              关联已有问题
            </Button>
          </div>
        )}
        {mode === 'link' ? (
          <>
            <label className="block">
              搜索问题
              <input
                className="ws-input mt-2"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setChosen('');
                }}
                maxLength={200}
              />
            </label>
            <Select
              aria-label="选择已有问题"
              value={chosen}
              onValueChange={setChosen}
              items={[
                { value: '', label: '请选择问题' },
                ...(page?.issues.map((item) => ({
                  value: item.id,
                  label: `${issueStatuses[item.status]} · ${item.title}`,
                })) ?? []),
              ]}
            />
          </>
        ) : (
          <>
            <label className="block">
              问题标题
              <input
                className="ws-input mt-2"
                required
                maxLength={200}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <div>
              <label htmlFor={`${titleId}-description`} className="block">
                问题描述
              </label>
              <textarea
                id={`${titleId}-description`}
                className="ws-input mt-2 min-h-32"
                maxLength={20000}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Select
                aria-label="问题分类"
                value={category}
                onValueChange={(value) => setCategory(value as typeof category)}
                items={options(issueCategories)}
              />
              <Select
                aria-label="严重程度"
                value={severity}
                onValueChange={(value) => setSeverity(value as typeof severity)}
                items={options(issueSeverities)}
              />
            </div>
            {issue && (
              <Select
                aria-label="问题状态"
                value={status}
                onValueChange={(value) => setStatus(value as typeof status)}
                items={options(issueStatuses)}
              />
            )}
            {issue && status === 'closed' && (
              <Select
                aria-label="关闭原因"
                value={reason}
                onValueChange={(value) => setReason(value as typeof reason)}
                items={options(closeReasons)}
              />
            )}
          </>
        )}
        {(error || (mode === 'link' && pageError)) && (
          <p role="alert" className="text-error-ink">
            {error || pageError?.message}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" disabled={busy} onClick={onDismiss}>
            取消
          </Button>
          <Button type="submit" variant="primary" disabled={busy || (mode === 'link' && !chosen)}>
            {busy ? '保存中…' : mode === 'link' ? '关联问题' : '保存问题'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
