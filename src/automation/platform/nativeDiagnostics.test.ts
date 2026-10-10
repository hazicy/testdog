import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentDeviceClient } from 'agent-device';
import { expect, it, vi } from 'vitest';
import { NativeDiagnostics } from './nativeDiagnostics';

it('retains quarantine when native recorder termination is unconfirmed', async () => {
  let path = '';
  const record = vi.fn(async (options: { action: string; path?: string }) => {
    if (options.action === 'start') {
      path = options.path!;
      await writeFile(path, 'pending video');

      return { recording: 'started', outPath: path };
    }

    return {
      recording: 'stopped',
      outPath: path,
      recorder: 'unconfirmed',
      nativePathDisposition: 'pending',
    };
  });
  const client = { recording: { record } } as unknown as AgentDeviceClient;
  const diagnostics = new NativeDiagnostics(client, 'owned-session', { video: true });
  try {
    await diagnostics.start(new AbortController().signal);
    await expect(
      diagnostics.capture({ kind: 'video' }, new AbortController().signal),
    ).rejects.toThrow('unconfirmed');
    expect(diagnostics.safeToRelease).toBe(false);
    await diagnostics.cleanup();
    // Cleanup cannot delete a file that may still have a live writer.
    expect(await (await import('node:fs/promises')).stat(path)).toBeDefined();
  } finally {
    if (path) await rm(join(path, '..'), { recursive: true, force: true });
  }
});
it('rejects an exported file outside the exact capture directory', async () => {
  const outside = await mkdtemp(join(tmpdir(), 'caseforge-foreign-'));
  const file = join(outside, 'foreign.mp4');

  await writeFile(file, 'foreign');
  let requested = '';
  const client = {
    recording: {
      record: vi.fn(async (options: { action: string; path?: string }) => {
        if (options.action === 'start') {
          requested = options.path!;

          return { recording: 'started', outPath: requested };
        }

        return { recording: 'stopped', recorder: 'confirmed', outPath: file };
      }),
    },
  } as unknown as AgentDeviceClient;
  const diagnostics = new NativeDiagnostics(client, 'owned-session', { video: true });
  try {
    await diagnostics.start(new AbortController().signal);
    await expect(
      diagnostics.capture({ kind: 'video' }, new AbortController().signal),
    ).rejects.toThrow('escaped');
    await diagnostics.cleanup();
    expect(await (await import('node:fs/promises')).stat(file)).toBeDefined();
  } finally {
    await rm(outside, { recursive: true, force: true });
  }
});
