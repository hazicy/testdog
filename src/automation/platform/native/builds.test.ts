import { afterAll, expect, it, vi } from 'vitest';
import { mkdtemp, writeFile, rm, mkdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const isolated = vi.hoisted(() => ({
  client: undefined as import('@electric-sql/pglite').PGlite | undefined,
}));

vi.mock('@/db', async () => {
  const result = await (await import('@/server/testing/testDatabase')).createTestDatabase();

  isolated.client = result.client;

  return { db: result.db };
});
import { db } from '@/db';
import { automationBuilds } from '@/db/schema';
import { getBuild, hashBuild, installedBuildHash } from './builds';

afterAll(() => isolated.client?.close());
it('validates platform, app identity and content hash before allowing an install', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'caseforge-build-test-'));
  try {
    const path = join(directory, 'fixture.apk');

    await writeFile(path, 'registered fixture');
    const [build] = await db
      .insert(automationBuilds)
      .values({
        platform: 'android',
        appId: 'com.example.test',
        path,
        sha256: await hashBuild(path),
      })
      .returning();

    expect((await getBuild(build.id, 'android', 'com.example.test')).id).toBe(build.id);
    await expect(getBuild(build.id, 'ios', 'com.example.test')).rejects.toThrow('不兼容');
    await expect(getBuild(build.id, 'android', 'com.example.other')).rejects.toThrow('不兼容');
    await writeFile(path, 'tampered fixture');
    await expect(getBuild(build.id, 'android', 'com.example.test')).rejects.toThrow('摘要不匹配');
    const app = join(directory, 'fixture.app');

    await mkdir(app);
    await writeFile(join(app, 'binary'), 'app binary');
    await symlink('binary', join(app, 'link'));
    const before = await hashBuild(app);

    expect(await hashBuild(app)).toBe(before);
    await writeFile(join(app, 'binary'), 'changed app');
    expect(await hashBuild(app)).not.toBe(before);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it('finishes installed APK hashing before deleting the pulled temporary files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'caseforge-adb-fixture-'));
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
