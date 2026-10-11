'use client';

import { useCallback, useId, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { Icon } from '@iconify/react/offline';
import closeIcon from '@iconify-icons/lucide/x';
import { Dialog, DialogHeader } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { buttonStyles } from '@/components/ui/buttonStyles';
import { fetchJson } from '@/client/api';
import { isActiveRun, type TestRun } from '@/features/runs/types';
import { statuses } from '@/features/runs/presentation';
import { RunDetail } from '@/features/runs/components/RunDetail';

export function TrialRunDialog({
  id,
  open,
  onClose,
  onActiveChange,
}: {
  id: string;
  open: boolean;
  onClose: () => void;
  onActiveChange: (active: boolean) => void;
}) {
  const titleId = useId();
  const [currentId, setCurrentId] = useState(id);
  const [run, setRun] = useState<TestRun>();
  const updateRun = useCallback(
    (next: TestRun) => {
      setRun(next);
      onActiveChange(isActiveRun(next.status));
    },
    [onActiveChange],
  );

  // The full workbench owns live updates while open; only poll status when closed.
  useSWR(
    !open && (!run || isActiveRun(run.status)) ? [`/api/runs/${currentId}`, 'trial-status'] : null,
    ([url]) => fetchJson<{ run: TestRun }>(url),
    { refreshInterval: 5000, onSuccess: (data) => updateRun(data.run) },
  );

  if (!open) return null;

  return (
    <Dialog
      titleId={titleId}
      busy={false}
      onDismiss={onClose}
      className="flex h-[min(900px,calc(100dvh-48px))] max-w-[1440px] flex-col overflow-hidden"
    >
      <DialogHeader className="shrink-0 items-center py-3">
        <div>
          <h2 id={titleId} className="text-base font-semibold">
            草稿试跑{run ? ` · ${statuses[run.status]}` : ''}
          </h2>
          <p className="mt-1 text-xs text-page-muted">
            执行本次草稿快照，不保存用例。关闭窗口后执行继续。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/runs/${currentId}`}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonStyles({ variant: 'ghost', size: 'sm' })}
          >
            查看完整记录 ↗
          </Link>
          <Button size="icon-sm" variant="ghost" aria-label="关闭试跑" onClick={onClose}>
            <Icon icon={closeIcon} width="18" aria-hidden="true" />
          </Button>
        </div>
      </DialogHeader>
      <div className="min-h-0 flex-1">
        <RunDetail
          key={currentId}
          id={currentId}
          embedded
          onRunChange={updateRun}
          onRunCreated={(next) => {
            setCurrentId(next.id);
            updateRun(next);
          }}
        />
      </div>
    </Dialog>
  );
}
