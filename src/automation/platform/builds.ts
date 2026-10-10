import { createHash, randomUUID } from 'node:crypto';
import { cp, lstat, mkdir, readFile, readdir, readlink, realpath } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { homedir } from 'node:os';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { automationBuilds } from '@/db/schema';
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
export async function registerBuild(platform: 'android' | 'ios', inputPath: string) {
  const source = await realpath(inputPath);
  if (extname(source) !== (platform === 'android' ? '.apk' : '.app'))
    throw new Error('Android 需要 APK，iOS 需要 .app');
  let appId: string;
  if (platform === 'ios')
    appId = (
      await exec('/usr/libexec/PlistBuddy', [
        '-c',
        'Print :CFBundleIdentifier',
        join(source, 'Info.plist'),
      ])
    ).stdout.trim();
  else {
    const sdk = process.env.ANDROID_SDK_ROOT || join(homedir(), 'Library/Android/sdk');
    const versions = (await readdir(join(sdk, 'build-tools'))).sort((a, b) =>
      b.localeCompare(a, undefined, { numeric: true }),
    );
    const output = (
      await exec(join(sdk, 'build-tools', versions[0], 'aapt'), ['dump', 'badging', source])
    ).stdout;
    const match = /^package: name='([^']+)'/m.exec(output);
    if (!match) throw new Error('无法读取 APK package ID');
    appId = match[1];
  }
  const id = randomUUID();
  const root = join(process.env.CASEFORGE_DATA_DIR || join(process.cwd(), '.automation'), 'builds');
  await mkdir(root, { recursive: true });
  const path = join(root, `${id}${platform === 'ios' ? '.app' : '.apk'}`);
  await cp(source, path, { recursive: platform === 'ios' });
  const sha256 = await hashBuild(path);
  const [build] = await db
    .insert(automationBuilds)
    .values({ id, platform, appId, sha256, path })
    .returning();
  return build;
}
export async function getBuild(id: string, platform: 'android' | 'ios', appId: string) {
  const [build] = await db.select().from(automationBuilds).where(eq(automationBuilds.id, id));
  if (!build || build.platform !== platform || build.appId !== appId)
    throw new Error('构建不存在或与应用/平台不兼容');
  if ((await hashBuild(build.path)) !== build.sha256) throw new Error('构建附件摘要不匹配');
  return build;
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
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
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
    !paths.length ||
    paths.some(
      (path) =>
        !/^\/(data\/app\/|system\/|product\/|system_ext\/|vendor\/)/.test(path) ||
        path.split('/').includes('..') ||
        !path.endsWith('.apk'),
    )
  )
    throw new Error('无法获取已安装应用的 APK 路径');
  const directory = await mkdtemp(join(tmpdir(), 'caseforge-fingerprint-'));
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
