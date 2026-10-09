import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { BrowserContext, Page } from 'playwright';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TestRun } from './types';
const store = vi.hoisted(() => ({
  insertArtifact: vi.fn(),
  insertStep: vi.fn(),
  finishStep: vi.fn(),
}));
vi.mock('./store', () => store);
import { RunRecorder } from './recorder';

let directory: string;
beforeEach(async () => {
  vi.clearAllMocks();
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
  recorder.onPage(page as unknown as Page);
  return { recorder, context, browserContext, page };
}

describe('recorder cleanup and partial archive recovery', () => {
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

  it('surfaces live capture errors discovered just before an interrupted stop', async () => {
    const { recorder, context, browserContext, page } = await fixture();
    page.screenshot.mockRejectedValue(new Error('live capture failed'));
    await vi.advanceTimersByTimeAsync(1000);
    await expect(recorder.stop(browserContext, true)).rejects.toMatchObject({
      cause: expect.objectContaining({ message: 'live capture failed' }),
    });
    expect(context.tracing.stop).not.toHaveBeenCalled();
    expect(context.close).toHaveBeenCalledTimes(1);
    expect(store.insertArtifact.mock.calls.map(([artifact]) => artifact.kind)).toEqual(['video']);
    await recorder.capture(page as unknown as Page, 'live');
    expect(page.screenshot).toHaveBeenCalledTimes(1);
  });
});
