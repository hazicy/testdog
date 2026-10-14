'use client';

import studioStyles from '@/features/runs/components/run-studio.module.css';
import styles from './RunLogs.module.css';

import { ModelUsagePanel } from '@/features/runs/components/ModelUsagePanel';
import type { RunArtifact, TestRun } from '@testdog/contracts/runs/types';
import { asset } from '@/features/runs/presentation';

type Props = {
  id: string;
  run?: TestRun;
  video?: RunArtifact;
  trace?: RunArtifact;
  diagnostics: RunArtifact[];
  onStep: (id: string) => void;
};

export function RunLogs({ id, run, video, trace, diagnostics, onStep }: Props) {
  return (
    <div className={studioStyles.studioPanel} aria-label="AI 日志内容">
      {(video || trace || diagnostics.length > 0) && (
        <div className={studioStyles.studioPanelToolbar}>
          <div className={styles.container}>
            {video && (
              <a className={styles.link} href={`${asset(id, video)}?download`}>
                下载录像 ↗
              </a>
            )}
            {diagnostics.length > 0 && (
              <details className={styles.details}>
                <summary className={styles.summary}>观察与诊断 ({diagnostics.length})</summary>
                <div className={styles.diagnosticLinks}>
                  {diagnostics.map((artifact) => (
                    <a
                      key={artifact.id}
                      className={styles.diagnosticLink}
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
              <a className={styles.link} href={asset(id, trace)}>
                下载 Trace ↗
              </a>
            )}
          </div>
        </div>
      )}
      <ModelUsagePanel
        id={id}
        active={!!run && ['queued', 'preparing', 'running', 'finalizing'].includes(run.status)}
        onStep={onStep}
      />
    </div>
  );
}
