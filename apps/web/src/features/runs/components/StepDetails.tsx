import styles from './StepDetails.module.css';
import { statusStyles } from '@/components/ui/statusStyles';
import { Button } from '@/components/ui/Button';
import type { ExecutionStep } from '@testdog/contracts/runs/types';
import type { indexRun } from '@/features/runs/lib/runIndex';
import { statuses } from '@/features/runs/presentation';

export function StepDetails({
  step,
  runError,
  stepFrames,
  onShowFrame,
  onIssue,
}: {
  step: ExecutionStep;
  runError?: string;
  stepFrames: ReturnType<typeof indexRun>['stepFrames'];
  onShowFrame: (index: number) => void;
  onIssue?: (step: ExecutionStep) => void;
}) {
  const action = step.action?.action;

  return (
    <div>
      <div className={styles.container}>
        <h3 className={styles.subheading}>{step.title}</h3>
        <span data-slot="status" data-status={step.status} className={statusStyles(step.status)}>
          <span />
          {statuses[step.status]}
        </span>
      </div>
      <p className={styles.description}>
        {step.pageId} / {step.pageUrl}
      </p>
      {step.platformAssertion && (
        <pre className={styles.code}>{JSON.stringify(step.platformAssertion, null, 2)}</pre>
      )}
      {action && (
        <div className={styles.actionDetails}>
          <p>action: {action.type}</p>
          {'target' in action && (
            <p className={styles.actionTarget}>
              target: {action.target.kind} /{' '}
              {('name' in action.target && action.target.name) || action.target.value}
            </p>
          )}
          {'value' in action && action.value && (
            <p className={styles.actionTarget}>
              value: {'sensitive' in action && action.sensitive ? '••••••••' : action.value}
            </p>
          )}
        </div>
      )}
      {step.evidence && <p className={styles.evidence}>验证证据：{step.evidence}</p>}
      {(step.error || runError) && (
        <pre className={styles.errorDetails}>{step.error || runError}</pre>
      )}
      <div className={styles.evidenceActions}>
        {onIssue && <Button onClick={() => onIssue(step)}>创建或关联问题</Button>}
        {(['before', 'after'] as const).map((stage) => {
          const index = stepFrames.get(step.id)?.[stage] ?? -1;

          return (
            <Button
              key={stage}
              disabled={index < 0}

              onClick={() => {
                onShowFrame(index);
              }}
            >
              {stage === 'before' ? '查看执行前' : '查看执行后'}
            </Button>
          );
        })}
        {!step.replayable && (
          <span className={styles.label}>本步骤缺少稳定定位器，无法重放操作。</span>
        )}
      </div>
    </div>
  );
}
