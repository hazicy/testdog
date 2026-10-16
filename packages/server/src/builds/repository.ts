import { hashBuild } from '@testdog/automation/platform/native/builds';
import { randomUUID } from 'node:crypto';
import { cp, mkdir, readdir, realpath } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { homedir } from 'node:os';
import { eq } from 'drizzle-orm';
import { db } from '@testdog/server/db';
import { automationBuilds } from '@testdog/server/db/schema';

const exec = promisify(execFile);

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
  const root = join(process.env.TESTDOG_DATA_DIR || join(process.cwd(), '.automation'), 'builds');

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
