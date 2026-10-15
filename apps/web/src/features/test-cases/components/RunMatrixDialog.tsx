'use client';

import { useTranslations } from 'next-intl';

import styles from './RunMatrixDialog.module.css';

import { DialogHeader, DialogFooter } from '@/components/ui/Dialog';
import { Label } from '@/components/ui/Label';
import { Textarea } from '@/components/ui/Textarea';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import type { TestCase } from '@testdog/contracts/test-cases/types';

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
  const t = useTranslations('editor');
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
      initialFocus="#matrix-code"
    >
      <form onSubmit={(event) => void onSubmit(event, matrixCode)}>
        <DialogHeader>
          <h2 id="matrix-title" className={styles.matrixTitle}>
            {t('matrixTitle', { name: test.name })}
          </h2>
        </DialogHeader>
        <div className={styles.container}>
          <p className={styles.description}>{t('matrixHint')}</p>
          <Label>
            {t('matrixConfig')}
            <Textarea
              id="matrix-code"
              className={styles.input}
              required
              aria-label={t('matrixConfig')}
              value={matrixCode}
              disabled={busy}
              onChange={(event) => setMatrixCode(event.target.value)}
            />
          </Label>
          <details className={styles.details}>
            <summary>{t('matrixExamples')}</summary>
            <pre className={styles.code}>
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
            <p role="alert" className={styles.error}>
              {matrixError}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" disabled={busy} onClick={() => onClose()}>
            {t('cancel')}
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? t('creating') : t('runMatrix')}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
