import { cp, mkdir, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const [app, target] = process.argv.slice(2);

if (!['web', 'worker'].includes(app) || !target)
  throw new Error('Usage: node tools/package-deployment.mjs <web|worker> <new-output-directory>');
const destination = resolve(target);
const envFilePattern = /(?:^|\/)\.env(?:\.[^/]*)?$/;

// Never overwrite an existing deployment or workspace directory.
await mkdir(destination, { recursive: false });
if (app === 'worker') {
  const result = spawnSync(
    'pnpm',
    ['--filter', '@testdog/worker', 'deploy', '--legacy', '--prod', destination],
    { stdio: 'inherit' },
  );

  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} else {
  const standalone = resolve('apps/web/.next/standalone');

  // Configuration is supplied by the deployment environment, never copied from development.
  await cp(standalone, destination, {
    recursive: true,
    verbatimSymlinks: true,
    filter: (path) => !envFilePattern.test(path),
  });
  await cp('apps/web/.next/static', resolve(destination, 'apps/web/.next/static'), {
    recursive: true,
  });
  await cp('apps/web/public', resolve(destination, 'apps/web/public'), { recursive: true });
  await readdir(resolve(destination, 'apps/web/.next/static'));
}
