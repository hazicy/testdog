import { chmod, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { BrowserContext, Page } from 'playwright';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TestRun } from '@/features/runs/types';

const store = vi.hoisted(() => ({
  insertArtifact: vi.fn(),
  insertStep: vi.fn(),
  finishStep: vi.fn(),
  appendBrowserLogs: vi.fn(),
}));

const preview = vi.hoisted(() => ({
  hasPreviewViewers: vi.fn(async () => true),
  publishPreview: vi.fn(async () => {}),
  previewInterval: () => 3000,
}));

vi.mock('@/server/realtime/preview', () => preview);
vi.mock('./repository', () => store);
import { RunRecorder } from './recorder';

let directory: string;

beforeEach(async () => {
  vi.clearAllMocks();
  preview.hasPreviewViewers.mockResolvedValue(true);
  preview.publishPreview.mockResolvedValue(undefined);
  directory = await mkdtemp(join(tmpdir(), 'caseforge-recorder-'));
  vi.stubEnv('CASEFORGE_DATA_DIR', directory);
  vi.useFakeTimers();
});
afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

async function fixture() {
  const video = join(directory, 'video.webm');

  await writeFile(video, 'video');
  const page = {
    isClosed: vi.fn(() => false),
    on: vi.fn(),
    off: vi.fn(),
    url: () => 'https://example.com',
    screenshot: vi.fn(async () => Buffer.from('jpeg')),
    video: () => ({ path: async () => video }),
  };
  const context = {
    pages: () => [page],
    on: vi.fn(),
    off: vi.fn(),
    close: vi.fn(async () => {}),
    tracing: {
      start: vi.fn(async () => {}),
      stop: vi.fn(async ({ path }: { path: string }) => {
        await writeFile(path, 'trace');
      }),
    },
  };
  const run: TestRun = {
    id: randomUUID(),
    name: 'Recording',
    url: page.url(),
    goal: 'Check',
    mode: 'record',
    status: 'running',
    startedAt: new Date().toISOString(),
    steps: [],
    artifacts: [],
    events: [],
    replayable: false,
    cancelRequested: false,
  };
  const recorder = new RunRecorder(run);
  const browserContext = context as unknown as BrowserContext;

  await recorder.start(browserContext);

  return { recorder, context, browserContext, page };
}

describe('recorder cleanup and partial archive recovery', () => {
  it('captures before/after evidence without waiting for slow storage and freezes page metadata', async () => {
    const { recorder, context, browserContext, page } = await fixture();
    let release!: () => void;

    store.insertArtifact.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const id = randomUUID();
    const browserPage = page as unknown as Page;

    await recorder.onStep({ id, kind: 'assertion', title: 'Check', phase: 'start' }, browserPage);
    page.url = () => 'https://example.com/after';
    await recorder.onStep({ id, kind: 'assertion', title: 'Check', phase: 'finish' }, browserPage);
    expect(page.screenshot).toHaveBeenCalledTimes(2);
    expect(store.insertArtifact).toHaveBeenCalledTimes(1);
    const stopping = recorder.stop(browserContext);

    expect(context.close).not.toHaveBeenCalled();
    release();
    await stopping;
    expect(
      store.insertArtifact.mock.calls
        .slice(0, 2)
        .map(([artifact]) => [artifact.stage, artifact.pageUrl, artifact.stepId]),
    ).toEqual([
      ['before', 'https://example.com', id],
      ['after', 'https://example.com/after', id],
    ]);
    expect(context.close).toHaveBeenCalledOnce();
  });

  it('reports background persistence failures and still archives trace/video and closes the context', async () => {
    const { recorder, context, browserContext, page } = await fixture();

    store.insertArtifact.mockRejectedValueOnce(new Error('database offline'));
    await recorder.capture(page as unknown as Page, 'before');
    await expect(recorder.stop(browserContext)).rejects.toThrow('执行附件归档失败');
    expect(context.close).toHaveBeenCalledOnce();
    expect(store.insertArtifact.mock.calls.map(([artifact]) => artifact.kind)).toContain('video');
  });
  it.skipIf(process.platform === 'win32')(
    'restricts execution directories and archived attachments to the owner',
    async () => {
      const { recorder, browserContext } = await fixture();

      await chmod(recorder.directory, 0o755);
      await recorder.prepare();
      expect((await stat(recorder.directory)).mode & 0o777).toBe(0o700);
      await recorder.stop(browserContext);
      const files = store.insertArtifact.mock.calls.map(([, path]) => path as string);

      expect(files).toHaveLength(3);
      for (const path of files) expect((await stat(path)).mode & 0o777).toBe(0o600);
    },
  );
  it('captures existing pages and returns to the main page after a popup closes', async () => {
    const { recorder, browserContext, page } = await fixture();

    await vi.advanceTimersByTimeAsync(3000);
    await vi.waitFor(() => expect(preview.publishPreview).toHaveBeenCalledTimes(1));
    expect(page.screenshot).toHaveBeenCalledTimes(1);
    const popup = {
      ...page,
      isClosed: vi.fn(() => false),
      url: () => 'https://example.com/popup',
      screenshot: vi.fn(async () => Buffer.from('popup')),
    };

    recorder.onPage(popup as unknown as Page);
    await vi.advanceTimersByTimeAsync(3000);
    await vi.waitFor(() => expect(preview.publishPreview).toHaveBeenCalledTimes(2));
    expect(popup.screenshot).toHaveBeenCalledTimes(1);
    popup.isClosed.mockReturnValue(true);
    await vi.advanceTimersByTimeAsync(3000);
    await vi.waitFor(() => expect(preview.publishPreview).toHaveBeenCalledTimes(3));
    expect(page.screenshot).toHaveBeenCalledTimes(2);
    await recorder.stop(browserContext);
    expect(page.screenshot).toHaveBeenCalledTimes(3);
    expect(popup.screenshot).toHaveBeenCalledTimes(1);
    expect(
      store.insertArtifact.mock.calls
        .map(([artifact]) => artifact)
        .filter((artifact) => artifact.kind === 'screenshot')
        .map(({ pageId, stage }) => ({ pageId, stage })),
    ).toEqual([{ pageId: 'page-1', stage: 'final' }]);
  });

  it('does not capture previews without a viewer or while steps are active', async () => {
    const { recorder, browserContext, page } = await fixture();

    preview.hasPreviewViewers.mockResolvedValue(false);
    await vi.advanceTimersByTimeAsync(6000);
    expect(page.screenshot).not.toHaveBeenCalled();
    preview.hasPreviewViewers.mockResolvedValue(true);
    await recorder.onStep(
      { id: randomUUID(), kind: 'assertion', title: 'Check', phase: 'start' },
      page as unknown as Page,
    );
    await vi.advanceTimersByTimeAsync(6000);
    expect(page.screenshot).toHaveBeenCalledTimes(1);
    expect(preview.publishPreview).not.toHaveBeenCalled();
    await recorder.stop(browserContext);
  });

  it('archives trace and video and closes the context even when the final screenshot fails', async () => {
    const { recorder, context, browserContext, page } = await fixture();

    page.screenshot.mockRejectedValue(new Error('screenshot failed'));
    await expect(recorder.stop(browserContext)).rejects.toThrow('执行附件归档失败');
    expect(context.off).toHaveBeenCalledWith('page', recorder.onPage);
    expect(context.close).toHaveBeenCalledTimes(1);
    expect(store.insertArtifact.mock.calls.map(([artifact]) => artifact.kind)).toEqual([
      'trace',
      'video',
    ]);
    await vi.advanceTimersByTimeAsync(3000);
    expect(page.screenshot).toHaveBeenCalledTimes(1);
  });

  it('continues archiving later videos after trace and one video fail', async () => {
    const { recorder, context, browserContext, page } = await fixture();

    context.tracing.stop.mockRejectedValue(new Error('trace failed'));
    const validVideo = page.video();

    page.video = () => ({ path: async () => join(directory, 'missing.webm') });
    recorder.onPage({
      ...page,
      video: () => validVideo,
    } as unknown as Page);
    const stopping = recorder.stop(browserContext);

    await expect(stopping).rejects.toMatchObject({
      errors: expect.arrayContaining([
        expect.objectContaining({ message: 'trace failed' }),
        expect.objectContaining({ code: 'ENOENT' }),
      ]),
    });
    expect(store.insertArtifact.mock.calls.map(([artifact]) => artifact.kind)).toEqual([
      'screenshot',
      'video',
    ]);
    expect(context.close).toHaveBeenCalledTimes(1);
    expect(recorder.stop(browserContext)).toBe(stopping);
    await expect(recorder.stop(browserContext)).rejects.toThrow();
    expect(context.close).toHaveBeenCalledTimes(1);
  });

  it('isolates preview failures from evidence and interrupted cleanup', async () => {
    const { recorder, context, browserContext, page } = await fixture();

    page.screenshot.mockRejectedValue(new Error('live capture failed'));
    await vi.advanceTimersByTimeAsync(3000);
    await expect(recorder.stop(browserContext, true)).resolves.toBeUndefined();
    expect(context.tracing.stop).not.toHaveBeenCalled();
    expect(context.close).toHaveBeenCalledTimes(1);
    expect(store.insertArtifact.mock.calls.map(([artifact]) => artifact.kind)).toEqual(['video']);
    await recorder.capture(page as unknown as Page, 'live');
    expect(page.screenshot).toHaveBeenCalledTimes(1);
  });
});
