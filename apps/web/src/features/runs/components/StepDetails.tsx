import { useTranslations } from 'next-intl';
import styles from './StepDetails.module.css';
import { statusStyles } from '@/components/ui/statusStyles';
import type { ExecutionStep } from '@testdog/contracts/runs/types';

export function StepDetails({ step, runError }: { step: ExecutionStep; runError?: string }) {
  const t = useTranslations('runs');
  const statusText = useTranslations('workspace');
  const action = step.action?.action;
  const error = step.error || (step.status === 'failed' ? runError : undefined);

  return (
    <div>
      <div className={styles.container}>
        <h3 className={styles.subheading}>{step.title}</h3>
        <span data-slot="status" data-status={step.status} className={statusStyles(step.status)}>
          <span />
          {statusText(step.status)}
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
      {step.evidence && (
        <p className={styles.evidence}>{t('evidence', { value: step.evidence })}</p>
      )}
      {error && <pre className={styles.errorDetails}>{error}</pre>}
      {!step.replayable && <p className={styles.label}>{t('locateFailed')}</p>}
    </div>
  );
}
