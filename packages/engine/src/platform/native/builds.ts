import { createHash } from 'node:crypto';
import { lstat, mkdtemp, readFile, readdir, readlink, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { homedir, tmpdir } from 'node:os';

const exec = promisify(execFile);

export async function hashBuild(path: string): Promise<string> {
  const hash = createHash('sha256');
  const visit = async (file: string, relative: string): Promise<void> => {
    const info = await lstat(file);

    hash.update(relative + '\0');
    if (info.isSymbolicLink()) hash.update('link\0' + (await readlink(file)));
    else if (info.isDirectory()) {
      for (const entry of (await readdir(file)).sort())
        await visit(join(file, entry), `${relative}/${entry}`);
    } else if (info.isFile()) hash.update(await readFile(file));
    else throw new Error('Unsupported build file');
  };

  await visit(path, '');

  return hash.digest('hex');
}

export async function clearAndroidData(deviceId: string, appId: string, signal: AbortSignal) {
  const sdk = process.env.ANDROID_SDK_ROOT || join(homedir(), 'Library/Android/sdk');
  const result = await exec(
    join(sdk, 'platform-tools', 'adb'),
    ['-s', deviceId, 'shell', 'pm', 'clear', appId],
    { signal, timeout: 30000 },
  );

  if (!result.stdout.includes('Success')) throw new Error('无法清理应用数据');
}

export async function installedBuildHash(
  platform: 'android' | 'ios',
  deviceId: string,
  appId: string,
  signal: AbortSignal,
): Promise<string> {
  if (platform === 'ios') {
    const path = (
      await exec('xcrun', ['simctl', 'get_app_container', deviceId, appId, 'app'], {
        signal,
        timeout: 15000,
      })
    ).stdout.trim();

    return hashBuild(path);
  }

  const sdk = process.env.ANDROID_SDK_ROOT || join(homedir(), 'Library/Android/sdk');
  const adb = join(sdk, 'platform-tools', 'adb');
  const paths = (
    await exec(adb, ['-s', deviceId, 'shell', 'pm', 'path', appId], { signal, timeout: 15000 })
  ).stdout
    .trim()
    .split('\n')
    .map((line) => line.trim().replace(/^package:/, ''))
    .sort();

  if (
    paths.some(
      (path) =>
        !/^\/(data\/app\/|system\/|product\/|system_ext\/|vendor\/)/.test(path) ||
        path.split('/').includes('..') ||
        !path.endsWith('.apk'),
    )
  )
    throw new Error('无法获取已安装应用的 APK 路径');
  const directory = await mkdtemp(join(tmpdir(), 'testdog-fingerprint-'));

  try {
    for (const [index, path] of paths.entries())
      await exec(adb, ['-s', deviceId, 'pull', path, join(directory, `${index}.apk`)], {
        signal,
        timeout: 30000,
      });

    return await hashBuild(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
