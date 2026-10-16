'use client';

import { useTranslations } from 'next-intl';

import clsx from 'clsx';

import styles from './RecordingEditor.module.css';
import studioStyles from '@/features/runs/components/run-studio.module.css';

import { useRunSubmission } from '@/client/useRunSubmission';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { isActiveRun } from '@testdog/contracts/runs/types';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@iconify/react/offline';
import downloadIcon from '@iconify-icons/lucide/download';
import saveIcon from '@iconify-icons/lucide/save';
import playIcon from '@iconify-icons/lucide/play';
import undoIcon from '@iconify-icons/lucide/rotate-ccw';
import type { RecordingVersion, TestRun } from '@testdog/contracts/runs/types';
import { parseRecordingScript, recordingScript } from '@testdog/contracts/runs/lib/recordingScript';
import {
  deviceRecordingScript,
  parseDeviceRecordingScript,
} from '@testdog/contracts/runs/lib/deviceRecording';
import { CodeEditor } from '@/features/runs/components/CodeEditor';
import { api } from '@/client/api';
import { downloadText } from '@/client/download';
import { recordingCodeSchema } from '@testdog/contracts/runs/schemas';

export function RecordingEditor({ run }: { run: TestRun }) {
  const t = useTranslations('runs');
  const router = useRouter();
  const submit = useRunSubmission();
  const platform = run.targetSnapshot.platform;
  const original = useMemo(
    () =>
      platform === 'web'
        ? recordingScript(run.recordingSteps || run.steps)
        : deviceRecordingScript(platform, run.recordingSteps || run.steps),
    [run.recordingSteps, run.steps, platform],
  );
  const [code, setCode] = useState(original);
  const [versions, setVersions] = useState<RecordingVersion[]>([]);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [validation, setValidation] = useState<{ code: string; error?: string }>();
  const validating = validation?.code !== code;
  const canSave = !busy && !validating && !validation?.error;
  const base = versions.find((v) => v.id === selected)?.code || original;
  const dirty = code !== base;

  useEffect(() => {
    const controller = new AbortController();

    void api
      .get(`/api/runs/${run.id}/recording`, {
        signal: controller.signal,
      })
      .json<{ versions: RecordingVersion[] }>()
      .then((data) => {
        if (!controller.signal.aborted) setVersions(data.versions);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });

    return () => {
      controller.abort();
    };
  }, [run.id]);
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        if (!recordingCodeSchema.safeParse(code).success) throw new Error(t('recordingInput'));
        if (platform === 'web') parseRecordingScript(code);
        else parseDeviceRecordingScript(code, platform);
        setValidation({ code });
      } catch (e) {
        setValidation({
          code,
          error: e instanceof Error ? e.message : t('invalidScript'),
        });
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [code, platform, t]);

  async function save(execute = false) {
    if (!canSave) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      let version = versions.find((v) => v.id === selected);

      if (!version || dirty) {
        const data = await api
          .post(`/api/runs/${run.id}/recording`, {
            json: { code },
          })
          .json<{ version: RecordingVersion }>();

        version = data.version;
        setVersions((current) => [data.version, ...current]);
        setSelected(version.id);
        setMessage(t('versionSaved'));
      }

      if (execute) {
        const data = await submit<{ run: TestRun }>('/api/runs', {
          mode: 'replay',
          sourceRunId: run.id,
          recordingVersionId: version.id,
        });

        router.push(`/runs/${data.run.id}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  function download() {
    downloadText(
      code,
      `recording-${run.id.slice(0, 8)}.${platform === 'web' ? 'js' : 'json'}`,
      platform === 'web' ? 'text/javascript' : 'application/json',
    );
  }

  if (isActiveRun(run.status))
    return <p className={styles.description}>{t('recordingInProgress')}</p>;

  return (
    <section
      className={clsx(studioStyles.studioPanel, studioStyles.recordingEditor)}
      aria-label={t('recordingEditor')}
    >
      <div className={studioStyles.recordingEditorToolbar}>
        <div className={studioStyles.recordingEditorSource}>
          <span className={studioStyles.recordingEditorLanguage}>
            {platform === 'web' ? 'JavaScript' : 'JSON'}
          </span>
          <Select
            aria-label={t('recordingVersion')}
            className={studioStyles.recordingEditorVersion}
            value={selected}
            disabled={busy}
            onValueChange={(value) => {
              setSelected(value);
              setCode(versions.find((v) => v.id === value)?.code || original);
              setMessage('');
            }}
            items={[
              {
                value: '',
                label: run.recordingVersionId ? t('snapshot') : t('originalRecording'),
              },
              versions.map((v, index) => ({
                value: v.id,
                label: t('version', { number: versions.length - index }),
              })),
            ]}
          />
        </div>
        <div className={studioStyles.recordingEditorActions}>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('restoreVersion')}
            title={t('restoreVersion')}
            disabled={busy || !dirty}
            onClick={() => setCode(base)}
          >
            <Icon icon={undoIcon} width="16" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('downloadScript')}
            title={t('downloadScript')}
            onClick={download}
          >
            <Icon icon={downloadIcon} width="16" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('saveVersion')}
            title={t('saveVersion')}
            disabled={!canSave}
            onClick={() => void save()}
          >
            <Icon icon={saveIcon} width="16" aria-hidden="true" />
          </Button>
          <Button
            variant="primary"
            size="icon-sm"
            aria-label={t('saveAndRun')}
            title={t('saveAndRunHint')}
            disabled={!canSave}
            onClick={() => void save(true)}
          >
            <Icon icon={playIcon} width="16" aria-hidden="true" />
          </Button>
        </div>
      </div>
      <CodeEditor
        value={code}
        onChange={setCode}
        readOnly={busy}
        label={platform === 'web' ? t('playwrightScript') : t('nativeRecording')}
      />
      {(error || (!validating && validation?.error)) && (
        <p role="alert" className={studioStyles.recordingEditorError}>
          {error || validation?.error}
        </p>
      )}
      {message && (
        <p role="status" className={studioStyles.recordingEditorFeedback}>
          {message}
        </p>
      )}
    </section>
  );
}
