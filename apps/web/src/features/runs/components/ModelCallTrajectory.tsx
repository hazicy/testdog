'use client';

import { useTranslations } from 'next-intl';

import useSWR from 'swr';
import { useEffect, useRef } from 'react';
import { Icon } from '@iconify/react/offline';
import copyIcon from '@iconify-icons/lucide/copy';
import { fetchJson } from '@/client/api';
import { useToastManager } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import type { ModelCallDetail } from '@testdog/contracts/runs/modelCalls';
import styles from './ModelUsagePanel.module.css';
import { useModelCallPurposes } from '@/features/runs/presentation';

function content(value: string) {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

export function ModelCallTrajectory({
  runId,
  callId,
  active,
  onStep,
}: {
  runId: string;
  callId: string;
  active: boolean;
  onStep: (id: string) => void;
}) {
  const t = useTranslations('runs');
  const modelCallPurposes = useModelCallPurposes();
  const data = useSWR<ModelCallDetail>(`/api/runs/${runId}/model-usage/${callId}`, fetchJson, {
    refreshInterval: active ? 5000 : 0,
  });
  const wasActive = useRef(active);
  const mutate = data.mutate;

  useEffect(() => {
    if (wasActive.current && !active) void mutate();
    wasActive.current = active;
  }, [active, mutate]);

  if (data.error)
    return (
      <div role="alert" className={styles.error}>
        {t('callLoadFailed')}
        <Button size="xs" onClick={() => void data.mutate()}>
          {t('retry')}
        </Button>
      </div>
    );
  if (!data.data)
    return (
      <p role="status" className={styles.loading}>
        {t('loading')}
      </p>
    );
  const { trace, steps } = data.data;

  return (
    <div className={styles.trajectory}>
      {!!trace?.input?.length && (
        <section aria-label={t('modelInput')}>
          {trace.input.map((message, index) => (
            <section key={index} className={styles.traceSection}>
              <h3>
                <span className={styles.role} data-role={message.role}>
                  {t(`roles.${message.role}`)}
                </span>
              </h3>
              <CopyableContent
                value={content(message.content)}
                label={t('copyRoleInput', { role: t(`roles.${message.role}`) })}
              />
            </section>
          ))}
        </section>
      )}
      {trace?.reply && (
        <section className={styles.traceSection} aria-label={t('modelReply')}>
          <h3 title={trace.truncated ? t('truncated') : undefined}>
            <span className={styles.role} data-role="assistant">
              {t('assistant')}
            </span>
            {trace.purpose ? modelCallPurposes[trace.purpose] || trace.purpose : t('modelReply')}
          </h3>
          <CopyableContent value={content(trace.reply)} label={t('copyReply')} />
        </section>
      )}
      {!!trace?.tools.length && (
        <ol className={styles.tools} aria-label={t('toolCalls')}>
          {trace.tools.map((tool) => {
            const results = steps.filter((step) => step.toolCallId === tool.id);
            const status = results.at(-1)?.status;

            return (
              <li key={tool.id} className={styles.traceSection}>
                <h3>
                  <span className={styles.role} data-role="tool">
                    {t('tool')}
                  </span>
                  <span
                    className={styles.toolName}
                    title={trace.truncated ? t('truncated') : undefined}
                  >
                    {tool.name}
                  </span>
                  <span className={styles.toolState} data-status={status}>
                    {status
                      ? t(`stepStatuses.${status}`)
                      : active
                        ? t('waiting')
                        : t('notExecuted')}
                  </span>
                </h3>
                <div className={styles.toolBody}>
                  <h4>{t('parameters')}</h4>
                  <CopyableContent
                    value={content(tool.arguments)}
                    label={t('copyToolParams', { name: tool.name })}
                  />
                  {results.map((step) => (
                    <StepResult key={step.id} step={step} onStep={onStep} />
                  ))}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {steps
        .filter((step) => !trace?.tools.some((tool) => tool.id === step.toolCallId))
        .map((step) => (
          <section key={step.id} className={styles.traceSection}>
            <h3>{step.title}</h3>
            {step.action && (
              <CopyableContent
                value={JSON.stringify(step.action.action, null, 2)}
                label={t('copyAction')}
              />
            )}
            <StepResult step={step} onStep={onStep} />
          </section>
        ))}
    </div>
  );
}

function StepResult({
  step,
  onStep,
}: {
  step: ModelCallDetail['steps'][number];
  onStep: (id: string) => void;
}) {
  const t = useTranslations('runs');
  const duration = step.durationMs !== undefined ? `${step.durationMs} ms` : undefined;
  const decision =
    step.decision === undefined
      ? undefined
      : step.decision
        ? t('decisionTrue')
        : t('decisionFalse');
  const result = [
    step.title,
    t(`stepStatuses.${step.status}`),
    duration,
    step.error,
    step.evidence,
    decision,
  ]
    .filter((value) => value !== undefined)
    .join('\n');

  return (
    <div className={styles.stepResult} aria-label={t('executionResult', { title: step.title })}>
      <h4>
        {t('result')}{' '}
        <span className={styles.toolState} data-status={step.status}>
          {t(`stepStatuses.${step.status}`)}
        </span>
        {duration && <span className={styles.duration}>{duration}</span>}
        <CopyButton label={t('copyResult')} value={result} />
      </h4>
      {step.error && <CopyableContent value={step.error} label={t('copyError')} error />}
      {step.evidence && <CopyableContent value={step.evidence} label={t('copyEvidence')} />}
      {decision && <span>{decision}</span>}
      <Button variant="ghost" size="xs" onClick={() => onStep(step.id)}>
        {t('viewStep')}
      </Button>
    </div>
  );
}

function CopyableContent({
  value,
  label,
  error,
}: {
  value: string;
  label: string;
  error?: boolean;
}) {
  return (
    <div className={styles.contentBlock}>
      <CopyButton value={value} label={label} />
      <pre className={error ? styles.errorCode : undefined}>{value}</pre>
    </div>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const t = useTranslations('runs');
  const toastManager = useToastManager();

  return (
    <span className={styles.copyControl}>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={label}
        title={label}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            toastManager.add({ title: t('copied'), type: 'success' });
          } catch {
            toastManager.add({ title: t('copyFailed'), type: 'error' });
          }
        }}
      >
        <Icon icon={copyIcon} width="13" aria-hidden="true" />
      </Button>
    </span>
  );
}
