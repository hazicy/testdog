'use client';

import useSWR from 'swr';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@iconify/react/offline';
import copyIcon from '@iconify-icons/lucide/copy';
import checkIcon from '@iconify-icons/lucide/check';
import { fetchJson } from '@/client/api';
import { Button } from '@/components/ui/Button';
import type { ModelCallDetail } from '@testdog/contracts/runs/modelCalls';
import styles from './ModelUsagePanel.module.css';
import { modelCallPurposes } from '@/features/runs/presentation';

const stepStatuses = { running: '执行中', passed: '完成', failed: '失败' };
const roles = { system: '系统', user: '用户', assistant: '助手' };

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
        无法加载调用详情
        <Button size="xs" onClick={() => void data.mutate()}>
          重试
        </Button>
      </div>
    );
  if (!data.data)
    return (
      <p role="status" className={styles.loading}>
        正在加载…
      </p>
    );
  const { trace, steps } = data.data;

  return (
    <div className={styles.trajectory}>
      {!!trace?.input?.length && (
        <section aria-label="模型输入">
          {trace.input.map((message, index) => (
            <section key={index} className={styles.traceSection}>
              <h3>
                <span className={styles.role} data-role={message.role}>
                  {roles[message.role]}
                </span>
              </h3>
              <CopyableContent
                value={content(message.content)}
                label={`复制${roles[message.role]}输入`}
              />
            </section>
          ))}
        </section>
      )}
      {trace?.reply && (
        <section className={styles.traceSection} aria-label="模型回复">
          <h3 title={trace.truncated ? '较长的回复或参数已截断' : undefined}>
            <span className={styles.role} data-role="assistant">
              助手
            </span>
            {trace.purpose ? modelCallPurposes[trace.purpose] || trace.purpose : '模型回复'}
          </h3>
          <CopyableContent value={content(trace.reply)} label="复制模型回复" />
        </section>
      )}
      {!!trace?.tools.length && (
        <ol className={styles.tools} aria-label="工具调用">
          {trace.tools.map((tool) => {
            const results = steps.filter((step) => step.toolCallId === tool.id);
            const status = results.at(-1)?.status;

            return (
              <li key={tool.id} className={styles.traceSection}>
                <h3>
                  <span className={styles.role} data-role="tool">
                    工具
                  </span>
                  <span
                    className={styles.toolName}
                    title={trace.truncated ? '较长的回复或参数已截断' : undefined}
                  >
                    {tool.name}
                  </span>
                  <span className={styles.toolState} data-status={status}>
                    {status ? stepStatuses[status] : active ? '等待执行' : '未执行'}
                  </span>
                </h3>
                <div className={styles.toolBody}>
                  <h4>参数</h4>
                  <CopyableContent
                    value={content(tool.arguments)}
                    label={`复制 ${tool.name} 参数`}
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
                label="复制步骤动作"
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
  const duration = step.durationMs !== undefined ? `${step.durationMs} ms` : undefined;
  const decision =
    step.decision === undefined ? undefined : step.decision ? '判断成立' : '判断不成立';
  const result = [
    step.title,
    stepStatuses[step.status],
    duration,
    step.error,
    step.evidence,
    decision,
  ]
    .filter((value) => value !== undefined)
    .join('\n');

  return (
    <div className={styles.stepResult} aria-label={`执行结果：${step.title}`}>
      <h4>
        结果{' '}
        <span className={styles.toolState} data-status={step.status}>
          {stepStatuses[step.status]}
        </span>
        {duration && <span className={styles.duration}>{duration}</span>}
        <CopyButton label="复制执行结果" value={result} />
      </h4>
      {step.error && <CopyableContent value={step.error} label="复制错误信息" error />}
      {step.evidence && <CopyableContent value={step.evidence} label="复制执行证据" />}
      {decision && <span>{decision}</span>}
      <Button variant="ghost" size="xs" onClick={() => onStep(step.id)}>
        查看步骤
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
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    if (status === 'idle') return;
    const timeout = setTimeout(() => setStatus('idle'), 2000);

    return () => clearTimeout(timeout);
  }, [status]);

  return (
    <span className={styles.copyControl}>
      {status !== 'idle' && (
        <span
          role={status === 'failed' ? 'alert' : 'status'}
          className={status === 'failed' ? styles.errorCode : undefined}
        >
          {status === 'copied' ? '已复制' : '复制失败，请重试'}
        </span>
      )}
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={label}
        title={label}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setStatus('copied');
          } catch {
            setStatus('failed');
          }
        }}
      >
        <Icon icon={status === 'copied' ? checkIcon : copyIcon} width="13" aria-hidden="true" />
      </Button>
    </span>
  );
}
