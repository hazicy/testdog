'use client';

import { useState } from 'react';
import type { TestRun } from '../types';

export function RunSnapshot({ run }: { run?: TestRun }) {
  const [snapshotOpen, setSnapshotOpen] = useState(false);

  return (
    <details className="border-b border-page-line">
      <summary className="studio-content cursor-pointer text-sm font-medium">用例快照</summary>
      <div className="studio-content pt-0">
        <h2 className="mb-3 text-lg font-semibold">{run?.name || '加载执行记录…'}</h2>
        <p className="mb-3 text-xs text-page-muted">
          执行时保存的版本，后续修改用例不会影响此记录。
        </p>
        <p className="break-all font-mono text-xs text-page-muted">{run?.url}</p>
        <p className="whitespace-pre-wrap text-sm leading-8 text-ink">{run?.goal}</p>
        <details
          className="mt-5 text-xs text-page-muted"
          onToggle={(event) => setSnapshotOpen(event.currentTarget.open)}
        >
          <summary className="cursor-pointer">平台目标与实际执行环境</summary>
          {snapshotOpen && (
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
          )}
        </details>
      </div>
    </details>
  );
}
