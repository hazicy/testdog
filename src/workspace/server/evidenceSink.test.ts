import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import type { AutomationSession } from '@/automation/platform/contracts';
import type { TestRun } from '../types';

const persistence = vi.hoisted(() => ({ insert: vi.fn() }));

vi.mock('./store', () => ({ insertArtifact: persistence.insert }));
import { EvidenceSink } from './evidenceSink';

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
