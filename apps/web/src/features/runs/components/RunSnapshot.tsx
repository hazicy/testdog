'use client';

import clsx from 'clsx';

import styles from './RunSnapshot.module.css';
import studioStyles from '@/features/runs/components/run-studio.module.css';

import { useState } from 'react';
import type { TestRun } from '@testdog/contracts/runs/types';

export function RunSnapshot({ run }: { run?: TestRun }) {
  const [snapshotOpen, setSnapshotOpen] = useState(false);

  return (
    <details className={styles.details}>
      <summary className={clsx(studioStyles.studioContent, styles.summary)}>用例快照</summary>
      <div className={clsx(studioStyles.studioContent, styles.container)}>
        <h2 className={styles.heading}>{run?.name || '加载执行记录…'}</h2>
        <p className={styles.description}>执行时保存的版本，后续修改用例不会影响此记录。</p>
        <p className={styles.targetUrl}>{run?.url}</p>
        <p className={styles.goal}>{run?.goal}</p>
        <details
          className={styles.environment}
          onToggle={(event) => setSnapshotOpen(event.currentTarget.open)}
        >
          <summary className={styles.environmentHeading}>平台目标与实际执行环境</summary>
          {snapshotOpen && (
            <pre className={styles.code}>
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
          )}
        </details>
      </div>
    </details>
  );
}
