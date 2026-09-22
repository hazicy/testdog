'use client';

import {
  Button,
  Card,
  Chip,
  EmptyState,
  Input,
  Label,
  Spinner,
  Surface,
  TextArea,
  TextField,
} from '@heroui/react';
import { useCallback, useEffect, useState } from 'react';
import { listFlows, recordCase, replayFlow, type FlowSummary } from './caseService';

type Feedback = {
  tone: 'success' | 'error';
  title: string;
  detail: string;
};

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN');
}

export function Case() {
  const [flowText, setFlowText] = useState('');
  const [startUrl, setStartUrl] = useState('');
  const [flows, setFlows] = useState<FlowSummary[]>([]);
  const [loadingFlows, setLoadingFlows] = useState(true);
  const [listError, setListError] = useState('');
  const [pending, setPending] = useState<'record' | string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const refresh = useCallback(async () => {
    setLoadingFlows(true);
    setListError('');
    try {
      setFlows(await listFlows());
    } catch (error) {
      setListError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingFlows(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const busy = pending !== null;

  async function handleRecord(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const goal = flowText.trim();
    if (!goal) {
      setFeedback({ tone: 'error', title: '无法开始录制', detail: '请先描述要执行的测试流程。' });
      return;
    }
    const url = startUrl.trim();
    if (!/^https?:\/\//.test(url)) {
      setFeedback({
        tone: 'error',
        title: '起始地址无效',
        detail: '请填写以 http:// 或 https:// 开头的完整地址。',
      });
      return;
    }
    setPending('record');
    setFeedback(null);
    try {
      const result = await recordCase({ case: goal, url });
      setFeedback({
        tone: 'success',
        title: '录制完成',
        detail: `已保存 ${result.steps} 个步骤，流程编号 ${result.flowId.slice(0, 8)}。`,
      });
      setFlowText('');
      await refresh();
    } catch (error) {
      setFeedback({
        tone: 'error',
        title: '录制失败',
        detail: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setPending(null);
    }
  }

  async function handleReplay(flow: FlowSummary) {
    setPending(flow.id);
    setFeedback(null);
    try {
      const result = await replayFlow(flow.id);
      setFeedback({
        tone: 'success',
        title: '回放通过',
        detail: `「${flow.goal}」共 ${result.steps} 步，结束于 ${result.url}`,
      });
    } catch (error) {
      setFeedback({
        tone: 'error',
        title: '回放失败',
        detail: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-7">
      <section aria-labelledby="page-title">
        <p className="mb-2 text-[10px] font-semibold tracking-[0.18em] text-accent">
          TEST MANAGEMENT
        </p>
        <h1 id="page-title" className="text-3xl font-semibold tracking-tight">
          测试用例
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          用自然语言描述流程，录制一次，之后随时回放执行。
        </p>
      </section>

      <Surface
        className="flex flex-col justify-between gap-6 rounded-xl border border-accent/15 bg-accent/5 p-5 md:p-7 xl:flex-row xl:items-center"
        aria-labelledby="intro-title"
      >
        <div>
          <span className="text-xs text-accent">从一个场景开始</span>
          <h2 id="intro-title" className="my-3 text-lg font-medium">
            描述 → 录制 → 回放
          </h2>
          <p className="text-xs leading-relaxed text-muted">
            录制会打开浏览器执行一遍并保存定位；回放复用这些定位重新跑一遍。
          </p>
        </div>
        <ol className="flex flex-wrap gap-2" aria-label="测试流程">
          {['描述场景', '浏览器录制', '一键回放'].map((step, index) => (
            <li
              key={step}
              className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3"
            >
              <span className="font-mono text-[10px] text-accent">0{index + 1}</span>
              <span className="text-[11px] text-muted">{step}</span>
            </li>
          ))}
        </ol>
      </Surface>

      <Card className="gap-0 border border-border p-0 shadow-none" aria-labelledby="record-title">
        <Card.Header className="flex flex-row flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <Card.Title id="record-title" className="text-sm">
            新建用例
          </Card.Title>
          <Chip size="sm" variant="soft" color="accent">
            自然语言录制
          </Chip>
        </Card.Header>
        <Card.Content>
          <form className="space-y-5 px-5 py-5" onSubmit={handleRecord}>
            <TextField
              isRequired
              fullWidth
              value={flowText}
              onChange={setFlowText}
              isDisabled={busy}
            >
              <Label className="text-xs font-medium">用例描述</Label>
              <TextArea
                fullWidth
                rows={3}
                className="mt-2"
                placeholder="例如：搜索极客湾，进入搜索结果中的第一个视频"
              />
            </TextField>
            <TextField
              fullWidth
              type="url"
              value={startUrl}
              onChange={setStartUrl}
              isDisabled={busy}
            >
              <Label className="text-xs font-medium">起始地址</Label>
              <Input fullWidth className="mt-2" placeholder="https://www.bilibili.com/" />
            </TextField>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[11px] leading-relaxed text-muted">
                录制需要模型密钥，会真实打开浏览器；回放不调用模型。
              </p>
              <Button type="submit" variant="primary" isDisabled={busy || !flowText.trim()}>
                {pending === 'record' ? (
                  <>
                    <Spinner size="sm" aria-label="录制中" />
                    录制中…
                  </>
                ) : (
                  '录制并保存'
                )}
              </Button>
            </div>
          </form>
        </Card.Content>
      </Card>

      {feedback && (
        <Surface
          role="status"
          aria-live="polite"
          className={`rounded-xl border p-4 text-sm ${
            feedback.tone === 'success'
              ? 'border-accent/30 bg-accent/5'
              : 'border-danger/30 bg-danger/5'
          }`}
        >
          <p className="font-medium">{feedback.title}</p>
          <p className="mt-1 break-all text-xs leading-relaxed text-muted">{feedback.detail}</p>
        </Surface>
      )}

      <Card className="gap-0 border border-border p-0 shadow-none" aria-labelledby="cases-title">
        <Card.Header className="flex flex-row flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <Card.Title id="cases-title" className="text-sm">
            已保存流程
          </Card.Title>
          <div className="flex items-center gap-2">
            <Chip size="sm" variant="soft">
              {flows.length} 条
            </Chip>
            <Button
              size="sm"
              variant="ghost"
              isDisabled={busy || loadingFlows}
              onPress={() => void refresh()}
            >
              刷新
            </Button>
          </div>
        </Card.Header>
        <Card.Content>
          {loadingFlows ? (
            <div className="flex min-h-40 items-center justify-center gap-2 py-10 text-xs text-muted">
              <Spinner size="sm" aria-label="加载中" />
              正在加载流程…
            </div>
          ) : listError ? (
            <EmptyState className="flex min-h-40 flex-col items-center justify-center px-5 py-10 text-center">
              <h3 className="text-base font-medium">无法读取流程</h3>
              <p className="mt-3 break-all text-xs leading-6 text-muted">{listError}</p>
            </EmptyState>
          ) : flows.length === 0 ? (
            <EmptyState className="flex min-h-60 flex-col items-center justify-center px-5 py-10 text-center">
              <span
                className="mb-5 flex size-14 items-center justify-center rounded-2xl border border-accent/15 bg-accent/5 text-3xl text-accent"
                aria-hidden="true"
              >
                ▤
              </span>
              <h3 className="text-base font-medium">还没有流程</h3>
              <p className="mt-3 text-xs leading-6 text-muted">
                在上方描述一个测试场景，
                <br />
                录制完成后即可在此一键回放。
              </p>
            </EmptyState>
          ) : (
            <ul className="divide-y divide-border">
              {flows.map((flow) => (
                <li
                  key={flow.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium" title={flow.goal}>
                      {flow.goal}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-muted">
                      <span>{flow.steps} 个步骤</span>
                      <span>{formatTime(flow.createdAt)}</span>
                      <span className="font-mono">{flow.id.slice(0, 8)}</span>
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    isDisabled={busy}
                    onPress={() => void handleReplay(flow)}
                  >
                    {pending === flow.id ? (
                      <>
                        <Spinner size="sm" aria-label="回放中" />
                        回放中…
                      </>
                    ) : (
                      '回放执行'
                    )}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card.Content>
        <Card.Footer className="border-t border-border px-5 py-4 text-[11px] text-muted">
          流程保存在本地 .automation 目录，回放不修改既有步骤。
        </Card.Footer>
      </Card>
    </div>
  );
}
