import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import type { AutomationSession } from '@testdog/contracts/automation/platform/contracts';
import type { TestRun } from '@testdog/contracts/runs/types';

const persistence = vi.hoisted(() => ({ insert: vi.fn() }));

vi.mock('@testdog/server/runs/repository', () => ({ insertArtifact: persistence.insert }));
import { EvidenceSink } from '@testdog/server/execution/recording/evidenceSink';
import { PersistenceQueue } from '@testdog/server/execution/recording/persistenceQueue';
import { DeviceRecorder } from '@testdog/server/execution/recording/deviceRecorder';

beforeEach(() => vi.clearAllMocks());

it.each(['before', 'live'] as const)(
  'drains %s capture failures with the correct evidence status',
  async (stage) => {
    const recorder = new DeviceRecorder({ id: randomUUID() } as TestRun);
    const session = {
      capture: vi.fn().mockRejectedValue(new Error('capture failed')),
    } as unknown as AutomationSession;

    await expect(recorder.capture(session, stage)).rejects.toThrow('capture failed');
    if (stage === 'live') await expect(recorder.drain()).resolves.toBeUndefined();
    else await expect(recorder.drain()).rejects.toThrow('capture failed');
  },
);

it('captures screenshot bytes and surface before queued storage while finalization waits', async () => {
  const root = await mkdtemp(join(tmpdir(), 'testdog-evidence-'));

  vi.stubEnv('TESTDOG_DATA_DIR', root);
  const queue = new PersistenceQueue();
  const sink = new EvidenceSink(
    { id: randomUUID(), startedAt: new Date().toISOString() } as TestRun,
    queue,
  );
  let release!: () => void;

  await queue.enqueue(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  const session = {
    id: 'web',
    platform: 'web',
    latestObservation: {
      surface: { platform: 'web', id: 'page-1', url: 'https://example.com/before' },
    },
    capture: vi.fn(async () => [
      { kind: 'screenshot', bytes: Buffer.from('before screenshot'), contentType: 'image/png' },
    ]),
  };

  try {
    await sink.capture(
      session as unknown as AutomationSession,
      { kind: 'screenshot' },
      'before',
      'step',
    );
    session.latestObservation = {
      surface: { platform: 'web', id: 'page-2', url: 'https://example.com/after' },
    };
    expect(persistence.insert).not.toHaveBeenCalled();
    release();
    await queue.drain();
    const [record, path] = persistence.insert.mock.calls[0];

    expect(record).toMatchObject({
      pageId: 'page-1',
      pageUrl: 'https://example.com/before',
      stage: 'before',
      stepId: 'step',
    });
    expect((await readFile(path)).toString()).toBe('before screenshot');
    sink.assertComplete();
  } finally {
    release();
    await queue.drain();
    vi.unstubAllEnvs();
    await rm(root, { recursive: true, force: true });
  }
});

it('keeps an earlier capture failure visible even after later evidence is saved successfully', async () => {
  const root = await mkdtemp(join(tmpdir(), 'testdog-evidence-'));

  vi.stubEnv('TESTDOG_DATA_DIR', root);
  const run = { id: randomUUID(), startedAt: new Date().toISOString() } as TestRun;
  const sink = new EvidenceSink(run);
  const session = {
    id: 'device-session',
    platform: 'ios',
    capture: vi
      .fn()
      .mockRejectedValueOnce(new Error('capture disconnected'))
      .mockResolvedValueOnce([
        {
          kind: 'screenshot',
          bytes: Buffer.from('screenshot bytes'),
          contentType: 'image/png',
          producer: 'agent-device',
          format: 'png',
        },
      ]),
  } as unknown as AutomationSession;

  try {
    await expect(sink.capture(session, { kind: 'screenshot' }, 'before', 'step')).rejects.toThrow(
      'disconnected',
    );
    await sink.capture(session, { kind: 'screenshot' }, 'after', 'step');
    expect(() => sink.assertComplete()).toThrow('disconnected');
    const [artifact, path] = persistence.insert.mock.calls[0];

    expect(artifact).toMatchObject({
      runId: run.id,
      stepId: 'step',
      kind: 'screenshot',
      producer: 'agent-device',
      format: 'png',
    });
    expect((await readFile(path)).toString()).toBe('screenshot bytes');
  } finally {
    vi.unstubAllEnvs();
    await rm(root, { recursive: true, force: true });
  }
});
