'use client';

import { ModelUsagePanel } from './ModelUsagePanel';
import type { RunArtifact, TestRun } from '@/features/runs/types';
import { asset } from '../presentation';

type Props = {
  id: string;
  run?: TestRun;
  video?: RunArtifact;
  trace?: RunArtifact;
  diagnostics: RunArtifact[];
};

export function RunLogs({ id, run, video, trace, diagnostics }: Props) {
  return (
    <div className="studio-panel" aria-label="执行日志内容">
      {(video || trace || diagnostics.length > 0) && (
        <div className="studio-panel-toolbar">
          <div className="ml-auto flex flex-wrap gap-3">
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
                      {artifact.kind} · {artifact.stage} · {(artifact.elapsedMs / 1000).toFixed(1)}s
                      ↗
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
      )}
      <div className="studio-content">
        <div className="font-mono text-xs leading-7">
          <ModelUsagePanel
            id={id}
            active={!!run && ['queued', 'preparing', 'running', 'finalizing'].includes(run.status)}
          />
          {run?.events.map((event, index) => (
            <div key={index} className="flex gap-4">
              <span className="shrink-0 text-page-muted">
                {new Date(event.at).toLocaleTimeString('zh-CN')}
              </span>
              <span className="text-ink">{event.message}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
