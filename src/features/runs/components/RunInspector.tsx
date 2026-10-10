'use client';
import { Button } from '@/components/ui/Button';
import type { ExecutionStep, RunArtifact, TestRun } from '@/workspace/types';
import type { indexRun } from '@/workspace/runIndex';
import { BrowserLogPanel } from './BrowserLogPanel';
import { asset, statuses } from '../presentation';

export type InspectorTab = 'step' | 'case' | 'logs' | 'console' | 'network';
type Props = {
  id: string;
  run?: TestRun;
  tab: InspectorTab;
  setTab: (tab: InspectorTab) => void;
  selectedStep?: ExecutionStep;
  currentFrame?: RunArtifact;
  video?: RunArtifact;
  trace?: RunArtifact;
  diagnostics: RunArtifact[];
  stepFrames: ReturnType<typeof indexRun>['stepFrames'];
  onShowFrame: (index: number) => void;
};

export function RunInspector({
  id,
  run,
  tab,
  setTab,
  selectedStep,
  currentFrame,
  video,
  trace,
  diagnostics,
  stepFrames,
  onShowFrame,
}: Props) {
  return (
    <div className="mt-6 overflow-hidden rounded-lg border border-page-line bg-surface">
      <div className="flex flex-wrap items-center gap-x-5 border-b border-page-line px-5">
        {[
          { id: 'step' as const, label: '步骤详情' },
          { id: 'case' as const, label: '用例快照' },
          { id: 'logs' as const, label: '执行日志' },
          { id: 'console' as const, label: 'Console' },
          { id: 'network' as const, label: 'Network' },
        ].map((item) => (
          <Button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={`whitespace-nowrap border-b-2 py-4 text-xs ${tab === item.id ? 'border-brand text-ink' : 'border-transparent text-page-muted'}`}
          >
            {item.label}
          </Button>
        ))}
        <div className="ml-auto flex w-full gap-3 pb-3 sm:w-auto sm:pb-0">
          {video && (
            <a
              className="text-xs text-page-muted hover:text-brand"
              href={`${asset(id, video)}?download`}
            >
              下载录像 ↗
            </a>
          )}
          {diagnostics.length > 0 && (
            <details className="relative text-[10px] text-page-muted">
              <summary className="cursor-pointer">观察与诊断 ({diagnostics.length})</summary>
              <div className="absolute right-0 z-10 max-h-60 min-w-48 overflow-auto border border-page-line bg-surface-raised p-3">
                {diagnostics.map((artifact) => (
                  <a
                    key={artifact.id}
                    className="block py-1 hover:text-brand"
                    href={`${asset(id, artifact)}?download`}
                  >
                    {artifact.kind} · {artifact.stage} · {(artifact.elapsedMs / 1000).toFixed(1)}s ↗
                  </a>
                ))}
              </div>
            </details>
          )}
          {trace && (
            <a className="text-xs text-page-muted hover:text-brand" href={asset(id, trace)}>
              下载 Trace ↗
            </a>
          )}
        </div>
      </div>
      <div className="p-5 sm:p-6">
        {tab === 'step' ? (
          selectedStep ? (
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-sm font-medium">{selectedStep.title}</h3>
                <span className={`ws-status ${selectedStep.status}`}>
                  <span />
                  {statuses[selectedStep.status]}
                </span>
              </div>
              <p className="mt-3 break-all font-mono text-xs text-page-muted">
                {selectedStep.pageId} / {selectedStep.pageUrl}
              </p>
              {selectedStep.platformAssertion && (
                <pre className="mt-4 whitespace-pre-wrap break-all border border-page-line p-4 text-xs">
                  {JSON.stringify(selectedStep.platformAssertion, null, 2)}
                </pre>
              )}
              {selectedStep.playwrightAssertion && (
                <pre className="mt-4 whitespace-pre-wrap break-all border border-page-line p-4 text-xs leading-6">
                  {JSON.stringify(selectedStep.playwrightAssertion, null, 2)}
                </pre>
              )}
              {selectedStep.platformAction && (
                <pre className="whitespace-pre-wrap break-all text-xs">
                  {JSON.stringify(selectedStep.platformAction, null, 2)}
                </pre>
              )}
              {selectedStep.action && (
                <div className="mt-4 border border-page-line bg-page p-4 font-mono text-xs leading-6">
                  <p>action: {selectedStep.action.type}</p>
                  {'target' in selectedStep.action && (
                    <p className="break-all">
                      target: {selectedStep.action.target.kind} /{' '}
                      {selectedStep.action.target.name || selectedStep.action.target.value}
                    </p>
                  )}
                  {selectedStep.action.value && (
                    <p className="break-all">
                      value:{' '}
                      {selectedStep.action.sensitive ? '••••••••' : selectedStep.action.value}
                    </p>
                  )}
                </div>
              )}
              {selectedStep.evidence && (
                <p className="mt-4 text-xs leading-6 text-step-success">
                  验证证据：{selectedStep.evidence}
                </p>
              )}
              {(selectedStep.error || run?.error) && (
                <pre className="mt-4 whitespace-pre-wrap break-words border border-error-line bg-error-soft p-4 text-xs leading-6 text-error-ink">
                  {selectedStep.error || run?.error}
                </pre>
              )}
              <div className="mt-4 flex gap-2">
                {(['before', 'after'] as const).map((stage) => {
                  const index = stepFrames.get(selectedStep.id)?.[stage] ?? -1;

                  return (
                    <Button
                      key={stage}
                      disabled={index < 0}
                      className="ws-button"
                      onClick={() => {
                        onShowFrame(index);
                      }}
                    >
                      {stage === 'before' ? '查看执行前' : '查看执行后'}
                    </Button>
                  );
                })}
                {!selectedStep.replayable && (
                  <span className="self-center text-xs text-page-muted">
                    本步骤缺少稳定定位器，无法重放操作。
                  </span>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-page-muted">
              {run?.error || '选择右侧步骤，查看操作、验证证据和前后画面。'}
            </p>
          )
        ) : tab === 'console' || tab === 'network' ? (
          run?.targetSnapshot && run.targetSnapshot.platform !== 'web' ? (
            <p className="text-sm text-page-muted">
              当前设备会话没有采集 {tab === 'console' ? '浏览器控制台' : '网络'}{' '}
              记录。截图与步骤证据保存在执行时间线中。
            </p>
          ) : (
            <BrowserLogPanel
              logs={run?.browserLogs || []}
              kind={tab}
              stepId={selectedStep?.id}
              elapsedMs={currentFrame?.elapsedMs}
            />
          )
        ) : tab === 'case' ? (
          <>
            <p className="mb-3 text-xs text-page-muted">
              执行时保存的版本，后续修改用例不会影响此记录。
            </p>
            <p className="whitespace-pre-wrap text-sm leading-8 text-ink">{run?.goal}</p>
            <details className="mt-5 text-xs text-page-muted">
              <summary className="cursor-pointer">平台目标与实际执行环境</summary>
              <pre className="mt-3 whitespace-pre-wrap break-all">
                {JSON.stringify(
                  {
                    target: run?.targetSnapshot,
                    environment: run?.environmentSnapshot,
                    capabilities: run?.capabilities,
                    batchId: run?.batchId,
                  },
                  null,
                  2,
                )}
              </pre>
            </details>
          </>
        ) : (
          <div className="font-mono text-xs leading-7">
            {run?.events.map((event, index) => (
              <div key={index} className="flex gap-4">
                <span className="shrink-0 text-page-muted">
                  {new Date(event.at).toLocaleTimeString('zh-CN')}
                </span>
                <span className="text-ink">{event.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
