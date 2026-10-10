import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import type { AutomationSession } from '@/automation/platform/contracts';
import type { TestRun } from '@/features/runs/types';

const persistence = vi.hoisted(() => ({ insert: vi.fn() }));

vi.mock('./repository', () => ({ insertArtifact: persistence.insert }));
import { EvidenceSink } from './evidenceSink';
import { PersistenceQueue } from './persistenceQueue';

beforeEach(() => vi.clearAllMocks());

it('captures snapshot bytes and surface before queued storage while finalization waits', async () => {
  const root = await mkdtemp(join(tmpdir(), 'caseforge-evidence-'));

  vi.stubEnv('CASEFORGE_DATA_DIR', root);
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
      { kind: 'snapshot', bytes: Buffer.from('before snapshot'), contentType: 'application/json' },
    ]),
  };

  try {
    await sink.capture(
      session as unknown as AutomationSession,
      { kind: 'snapshot' },
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
    expect((await readFile(path)).toString()).toBe('before snapshot');
    sink.assertComplete();
  } finally {
    release();
    await queue.drain();
    vi.unstubAllEnvs();
    await rm(root, { recursive: true, force: true });
  }
});

it('keeps an earlier capture failure visible even after later evidence is saved successfully', async () => {
  const root = await mkdtemp(join(tmpdir(), 'caseforge-evidence-'));

  vi.stubEnv('CASEFORGE_DATA_DIR', root);
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
          kind: 'snapshot',
          bytes: Buffer.from('{"redacted":true}'),
          contentType: 'application/json',
          producer: 'agent-device',
          format: 'caseforge-observation-v1',
        },
      ]),
  } as unknown as AutomationSession;

  try {
    await expect(sink.capture(session, { kind: 'snapshot' }, 'before', 'step')).rejects.toThrow(
      'disconnected',
    );
    await sink.capture(session, { kind: 'snapshot' }, 'after', 'step');
    expect(() => sink.assertComplete()).toThrow('disconnected');
    const [artifact, path] = persistence.insert.mock.calls[0];

    expect(artifact).toMatchObject({
      runId: run.id,
      stepId: 'step',
      kind: 'snapshot',
      producer: 'agent-device',
      format: 'caseforge-observation-v1',
    });
    expect((await readFile(path)).toString()).toBe('{"redacted":true}');
  } finally {
    vi.unstubAllEnvs();
    await rm(root, { recursive: true, force: true });
  }
});
