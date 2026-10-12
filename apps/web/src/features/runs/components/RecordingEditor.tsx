'use client';

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
import { recordingCodeSchema, recordingInputMessage } from '@testdog/contracts/runs/schemas';

export function RecordingEditor({ run }: { run: TestRun }) {
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
  const [validation, setValidation] = useState<{ code: string; count: number; error?: string }>();
  const validating = validation?.code !== code;
  const canSave = !busy && !validating && !validation?.error && !!validation?.count;
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
        if (!recordingCodeSchema.safeParse(code).success) throw new Error(recordingInputMessage);
        setValidation({
          code,
          count: (platform === 'web'
            ? parseRecordingScript(code)
            : parseDeviceRecordingScript(code, platform)
          ).length,
        });
      } catch (e) {
        setValidation({ code, count: 0, error: e instanceof Error ? e.message : '脚本无效' });
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [code, platform]);

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
        setMessage('新版本已保存。');
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
      setError(e instanceof Error ? e.message : '保存失败');
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
    return (
      <p className="border border-page-line p-6 text-sm text-page-muted">
        录制进行中，结束后可编辑操作和预期。
      </p>
    );

  return (
    <section className="studio-panel recording-editor" aria-label="录制编辑器">
      <div className="recording-editor-toolbar">
        <div className="recording-editor-source">
          <span className="recording-editor-language">
            {platform === 'web' ? 'JavaScript' : 'JSON'}
          </span>
          <Select
            aria-label="录制版本"
            className="recording-editor-version"
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
                label: run.recordingVersionId ? '执行快照' : '原始录制',
              },
              versions.map((v, index) => ({
                value: v.id,
                label: `版本 ${versions.length - index}`,
              })),
            ]}
          />
        </div>
        <div className="recording-editor-actions">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="还原当前版本"
            title="还原当前版本"
            disabled={busy || !dirty}
            onClick={() => setCode(base)}
          >
            <Icon icon={undoIcon} width="16" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="下载脚本"
            title="下载脚本"
            onClick={download}
          >
            <Icon icon={downloadIcon} width="16" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="保存版本"
            title="保存版本"
            disabled={!canSave}
            onClick={() => void save()}
          >
            <Icon icon={saveIcon} width="16" aria-hidden="true" />
          </Button>
          <Button
            variant="primary"
            size="icon-sm"
            aria-label="重放"
            title="重放"
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
        label={platform === 'web' ? 'Playwright 录制脚本' : '原生设备录制 JSON'}
      />
      {(error || (!validating && validation?.error)) && (
        <p role="alert" className="recording-editor-error">
          {error || validation?.error}
        </p>
      )}
      {message && (
        <p role="status" className="recording-editor-feedback">
          {message}
        </p>
      )}
    </section>
  );
}
