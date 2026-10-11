import { Button } from '@/components/ui/Button';
import type { ExecutionStep } from '../types';
import type { indexRun } from '../lib/runIndex';
import { statuses } from '../presentation';

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
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-sm font-medium">{step.title}</h3>
        <span className={`ws-status ${step.status}`}>
          <span />
          {statuses[step.status]}
        </span>
      </div>
      <p className="mt-3 break-all font-mono text-xs text-page-muted">
        {step.pageId} / {step.pageUrl}
      </p>
      {step.platformAssertion && (
        <pre className="mt-4 whitespace-pre-wrap break-all border border-page-line p-4 text-xs">
          {JSON.stringify(step.platformAssertion, null, 2)}
        </pre>
      )}
      {step.playwrightAssertion && (
        <pre className="mt-4 whitespace-pre-wrap break-all border border-page-line p-4 text-xs leading-6">
          {JSON.stringify(step.playwrightAssertion, null, 2)}
        </pre>
      )}
      {step.platformAction && (
        <pre className="whitespace-pre-wrap break-all text-xs">
          {JSON.stringify(step.platformAction, null, 2)}
        </pre>
      )}
      {step.action && (
        <div className="mt-4 border border-page-line bg-page p-4 font-mono text-xs leading-6">
          <p>action: {step.action.type}</p>
          {'target' in step.action && (
            <p className="break-all">
              target: {step.action.target.kind} /{' '}
              {step.action.target.name || step.action.target.value}
            </p>
          )}
          {step.action.value && (
            <p className="break-all">
              value: {step.action.sensitive ? '••••••••' : step.action.value}
            </p>
          )}
        </div>
      )}
      {step.evidence && (
        <p className="mt-4 text-xs leading-6 text-step-success">验证证据：{step.evidence}</p>
      )}
      {(step.error || runError) && (
        <pre className="mt-4 whitespace-pre-wrap break-words border border-error-line bg-error-soft p-4 text-xs leading-6 text-error-ink">
          {step.error || runError}
        </pre>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
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
          <span className="self-center text-xs text-page-muted">
            本步骤缺少稳定定位器，无法重放操作。
          </span>
        )}
      </div>
    </div>
  );
}
