import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentDeviceClient } from 'agent-device';
import { expect, it, vi } from 'vitest';
import { NativeVideoRecorder } from '@testdog/automation/platform/native/nativeVideoRecorder';

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
  const recorder = new NativeVideoRecorder(client, { video: true });

  try {
    await recorder.start(new AbortController().signal);
    await expect(recorder.capture({ kind: 'video' }, new AbortController().signal)).rejects.toThrow(
      'unconfirmed',
    );
    expect(recorder.safeToRelease).toBe(false);
    await recorder.cleanup();
    // Cleanup cannot delete a file that may still have a live writer.
    expect(await (await import('node:fs/promises')).stat(path)).toBeDefined();
  } finally {
    if (path) await rm(join(path, '..'), { recursive: true, force: true });
  }
});
it('rejects an exported file outside the exact capture directory', async () => {
  const outside = await mkdtemp(join(tmpdir(), 'testdog-foreign-'));
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
  const recorder = new NativeVideoRecorder(client, { video: true });

  try {
    await recorder.start(new AbortController().signal);
    await expect(recorder.capture({ kind: 'video' }, new AbortController().signal)).rejects.toThrow(
      'escaped',
    );
    await recorder.cleanup();
    expect(await (await import('node:fs/promises')).stat(file)).toBeDefined();
  } finally {
    await rm(outside, { recursive: true, force: true });
  }
});

it('shares a pending video export with concurrent finalization', async () => {
  let path = '';
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const record = vi.fn(async (options: { action: string; path?: string }) => {
    if (options.action === 'start') {
      path = options.path!;
      await writeFile(path, 'owned video');

      return { recording: 'started', outPath: path };
    }

    await pending;

    return { recording: 'stopped', recorder: 'confirmed', outPath: path };
  });
  const recorder = new NativeVideoRecorder(
    { recording: { record } } as unknown as AgentDeviceClient,
    { video: true },
  );
  const signal = new AbortController().signal;

  try {
    await recorder.start(signal);
    const capturing = recorder.capture({ kind: 'video' }, signal);
    const stopping = recorder.stop(signal);

    release();
    const artifacts = await capturing;

    await stopping;
    expect(record.mock.calls.filter(([options]) => options.action === 'stop')).toHaveLength(1);
    expect(artifacts[0].bytes.toString()).toBe('owned video');
    expect(await recorder.capture({ kind: 'video' }, signal)).toEqual(artifacts);
    expect(recorder.safeToRelease).toBe(true);
  } finally {
    await recorder.cleanup();
  }
});
