import 'dotenv/config';
import { registerBuild } from '../src/automation/platform/builds';
import { pool } from '../src/db';

const [platform, path] = process.argv.slice(2);
if ((platform !== 'ios' && platform !== 'android') || !path)
  throw new Error('Usage: pnpm register:build <android|ios> <path.apk|path.app>');
try {
  const build = await registerBuild(platform, path);

  process.stdout.write(
    JSON.stringify({
      id: build.id,
      platform: build.platform,
      appId: build.appId,
      sha256: build.sha256,
    }) + '\n',
  );
} finally {
  await pool.end();
}
