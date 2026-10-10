'use client';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { isActiveRun } from '@/features/runs/types';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { RecordingVersion, TestRun } from '@/features/runs/types';
import { parseRecordingScript, recordingScript } from '@/features/runs/lib/recordingScript';
import {
  deviceRecordingScript,
  parseDeviceRecordingScript,
} from '@/features/runs/lib/deviceRecording';
import { CodeEditor } from './CodeEditor';
import { api } from '@/client/api';
import { downloadText } from '@/client/download';
import { recordingCodeSchema, recordingInputMessage } from '@/features/runs/schemas';

export function RecordingEditor({ run }: { run: TestRun }) {
  const router = useRouter();
  const platform = run.targetSnapshot?.platform ?? 'web';
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
        const data = await api
          .post('/api/runs', {
            json: {
              mode: 'replay',
              sourceRunId: run.id,
              recordingVersionId: version.id,
            },
          })
          .json<{ run: TestRun }>();

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
    <section className="border border-page-line bg-surface" aria-label="录制编辑器">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-page-line p-5">
        <div>
          <h2 className="text-sm font-medium">
            {platform === 'web' ? 'Playwright 操作与预期' : '设备动作与预期（JSON）'}
          </h2>
          <p className="mt-2 text-xs leading-6 text-page-muted">
            修改定位器、操作顺序、输入值和断言。保存为独立版本后重放。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button className="ws-button" onClick={download}>
            下载脚本
          </Button>
          <Button className="ws-button" disabled={!canSave} onClick={() => void save()}>
            保存版本
          </Button>
          <Button className="ws-button primary" disabled={!canSave} onClick={() => void save(true)}>
            {busy ? '处理中…' : '保存并重放'}
          </Button>
        </div>
      </div>
      <div className="grid min-w-0 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0 p-4">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <label className="text-xs text-page-muted">
              版本{' '}
              <Select
                aria-label="录制版本"
                className="ml-2 max-w-full border border-page-line bg-page p-2 text-ink"
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
                    label: <>{run.recordingVersionId ? '本次执行的编辑快照' : '原始录制'}</>,
                  },
                  versions.map((v, index) => ({
                    value: v.id,
                    label: (
                      <>
                        版本 {versions.length - index} ·{' '}
                        {new Date(v.createdAt).toLocaleString('zh-CN')}
                      </>
                    ),
                  })),
                ]}
              />
            </label>
            <span className="text-xs text-page-muted">
              {dirty ? '有未保存修改' : '已载入'}
              {validating
                ? ' · 正在校验…'
                : validation?.count
                  ? ` · ${validation.count} 个步骤`
                  : ''}
            </span>
            {dirty && (
              <Button className="text-xs text-brand" disabled={busy} onClick={() => setCode(base)}>
                还原当前版本
              </Button>
            )}
          </div>
          <CodeEditor
            value={code}
            onChange={setCode}
            readOnly={busy}
            label={platform === 'web' ? 'Playwright 录制脚本' : '原生设备录制 JSON'}
          />
          {(error || (!validating && validation?.error)) && (
            <p role="alert" className="mt-3 whitespace-pre-wrap text-xs leading-6 text-error-ink">
              {error || validation?.error}
            </p>
          )}
          {message && (
            <p role="status" className="mt-3 text-xs text-step-success">
              {message}
            </p>
          )}
        </div>
        <aside className="border-t border-page-line p-5 text-xs leading-6 lg:border-t-0 lg:border-l">
          {platform !== 'web' ? (
            <>
              <p className="font-medium">设备录制格式</p>
              <p className="mt-3 text-page-muted">
                JSON 包含 schemaVersion、platform 和 steps。每步填写 title 及 action、assertion 或
                condition。
              </p>
              <pre className="mt-4 whitespace-pre-wrap break-all text-[10px]">
                {JSON.stringify(
                  {
                    title: '点击提交',
                    action: { type: 'tap', target: { kind: 'identifier', value: 'submit' } },
                  },
                  null,
                  2,
                )}
              </pre>
              <p className="mt-4 text-page-muted">
                动作支持 tap、fill、back 和等待指定文本。定位使用 identifier 或唯一 label，可附加
                role。临时 ref 和坐标手势不能用于重放。
              </p>
            </>
          ) : (
            <>
              <p className="font-medium">支持的写法</p>
              <p className="mt-3 text-page-muted">
                page1 为初始页面，新标签页依次为 page2、page3。每行一个 await 调用。
              </p>
              <pre className="mt-4 whitespace-pre-wrap break-all text-[10px]">
                {
                  'await page1.getByRole("button", { name: "提交", exact: true }).click();\n\nawait page1.getByLabel("邮箱", { exact: true }).fill("ada@example.com");\n\nawait expect(page1.getByText("成功", { exact: true })).toBeVisible();\n\nawait expectPage(page1, "已登录，显示用户名 Ada");\n\nawait waitFor(page1, "newPage", "", 5000);'
                }
              </pre>
              <p className="mt-4 text-page-muted">
                定位器支持 role、label、placeholder、testId、CSS 和
                nth。文本定位器用于断言。断言支持
                toBeVisible、toHaveText、toContainText、toHaveValue、toHaveURL 和 .not。
              </p>
              <p className="mt-4 text-page-muted">
                expectPage / expectBranch 保留录制时的模型验证。等待时间为 1000–5000 毫秒。@node
                注释用于关联画板节点。
              </p>
            </>
          )}
        </aside>
      </div>
    </section>
  );
}
