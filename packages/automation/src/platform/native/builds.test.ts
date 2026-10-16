import { expect, it, vi } from 'vitest';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hashBuild, installedBuildHash } from '@testdog/automation/platform/native/builds';

it('finishes installed APK hashing before deleting the pulled temporary files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'testdog-adb-fixture-'));
  const tools = join(root, 'platform-tools');

  await mkdir(tools);
  await writeFile(
    join(tools, 'adb'),
    '#!/bin/sh\nif [ "$4" = "pm" ]; then\n  printf "package:/data/app/fixture/base.apk\\n"\nelif [ "$3" = "pull" ]; then\n  printf "APK fixture bytes" > "$5"\nfi\n',
    { mode: 0o700 },
  );
  vi.stubEnv('ANDROID_SDK_ROOT', root);
  try {
    const expected = join(root, 'expected');

    await mkdir(expected);
    await writeFile(join(expected, '0.apk'), 'APK fixture bytes');
    expect(
      await installedBuildHash(
        'android',
        'fixture',
        'com.example.app',
        new AbortController().signal,
      ),
    ).toBe(await hashBuild(expected));
  } finally {
    vi.unstubAllEnvs();
    await rm(root, { recursive: true, force: true });
  }
});

it('rejects empty or unsafe APK paths before pulling files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'testdog-adb-paths-'));
  const tools = join(root, 'platform-tools');

  await mkdir(tools);
  vi.stubEnv('ANDROID_SDK_ROOT', root);
  try {
    for (const output of ['', 'package:/data/app/../private.apk', 'package:/tmp/app.apk']) {
      await writeFile(
        join(tools, 'adb'),
        `#!/bin/sh\nif [ "$4" = "pm" ]; then\n  printf '%s' '${output}'\nelse\n  exit 1\nfi\n`,
        { mode: 0o700 },
      );
      await expect(
        installedBuildHash('android', 'fixture', 'com.example.app', new AbortController().signal),
      ).rejects.toThrow('无法获取已安装应用的 APK 路径');
    }
  } finally {
    vi.unstubAllEnvs();
    await rm(root, { recursive: true, force: true });
  }
});
