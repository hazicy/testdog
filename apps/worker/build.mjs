import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8'));

await build({
  entryPoints: [
    'worker',
    'maintenance',
    'notifications',
    'register-build',
    'recover-resource',
    'assign-legacy-data',
    'backfill-issues',
  ].map((name) => `src/${name}.ts`),
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
