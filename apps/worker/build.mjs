import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8'));

await build({
  entryPoints: {
    worker: 'src/processes/worker.ts',
    maintenance: 'src/processes/maintenance.ts',
    notifications: 'src/processes/notifications.ts',
    'register-build': 'src/commands/register-build.ts',
    'recover-resource': 'src/commands/recover-resource.ts',
    'assign-legacy-data': 'src/commands/assign-legacy-data.ts',
    'backfill-issues': 'src/commands/backfill-issues.ts',
  },
  outdir: 'dist',
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  sourcemap: true,
  external: Object.keys(manifest.dependencies).filter((name) => !name.startsWith('@testdog/')),
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
});
