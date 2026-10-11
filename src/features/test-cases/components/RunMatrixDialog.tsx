'use client';

import { DialogHeader, DialogFooter } from '@/components/ui/Dialog';
import { Label } from '@/components/ui/Label';
import { Textarea } from '@/components/ui/Textarea';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import type { TestCase } from '@/features/test-cases/types';

export function RunMatrixDialog({
  test,
  busy,
  error: matrixError,
  onClose,
  onSubmit,
}: {
  test: TestCase;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (event: FormEvent, code: string) => Promise<void>;
}) {
  const [matrixCode, setMatrixCode] = useState(() => {
    const target = test.target || {
      schemaVersion: 1,
      platform: 'web',
      url: test.url,
      browser: 'chromium',
      deviceProfile: 'legacy-desktop',
    };

    return JSON.stringify([{ target, goal: test.goal }], null, 2);
  });

  return (
    <Dialog
      titleId="matrix-title"
      busy={busy}
      onDismiss={() => onClose()}
      initialFocus='[aria-label="运行配置（JSON）"]'
    >
      <form onSubmit={(event) => void onSubmit(event, matrixCode)}>
        <DialogHeader>
          <h2 id="matrix-title" className="text-lg font-semibold">
            平台矩阵 · {test.name}
          </h2>
        </DialogHeader>
        <div className="space-y-4 p-6">
          <p className="text-sm text-page-muted">
            填写 1–10 个运行配置。每项包含 target，可用 goal
            覆盖该平台的步骤与预期。所有运行一起创建，各自排队。
          </p>
          <Label>
            运行配置（JSON）
            <Textarea
              className="min-h-72 font-mono text-xs"
              required
              aria-label="运行配置（JSON）"
              value={matrixCode}
              disabled={busy}
              onChange={(event) => setMatrixCode(event.target.value)}
            />
          </Label>
          <details className="text-xs text-page-muted">
            <summary>平台配置示例</summary>
            <pre className="mt-2 overflow-auto">
              {JSON.stringify(
                [
                  {
                    target: {
                      platform: 'web',
                      url: 'https://example.com',
                      browser: 'chromium',
                      deviceProfile: 'Pixel 7',
                    },
                  },
                  {
                    target: {
                      platform: 'android',
                      appId: 'com.example.app',
                      deviceProfileId: 'android-phone',
                      resetPolicy: 'preserve',
                    },
                  },
                  {
                    target: {
                      platform: 'ios',
                      appId: 'com.example.app',
                      deviceProfileId: 'iphone-simulator',
                      resetPolicy: 'preserve',
                    },
                  },
                ],
                null,
                2,
              )}
            </pre>
          </details>
          {matrixError && (
            <p role="alert" className="text-sm text-error-ink">
              {matrixError}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" disabled={busy} onClick={() => onClose()}>
            取消
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? '创建中…' : '运行矩阵'}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
