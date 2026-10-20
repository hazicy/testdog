import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { build } from 'esbuild';
import { afterAll, beforeAll, expect, it } from 'vitest';

const execute = promisify(execFile);
const workerRoot = fileURLToPath(new URL('..', import.meta.url));
let directory: string;

beforeAll(async () => {
  // Keep scripts under the worker so Node resolves its production dependencies.
  directory = await mkdtemp(join(workerRoot, '.test-observation-'));
});
afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});

it.each(['tsx', 'bundle'])(
  'observes a caller-selected plain region through the %s worker runtime',
  async (runtime) => {
    const observer = fileURLToPath(import.meta.resolve('@testdog/engine/platform/web/observer'));
    const view = fileURLToPath(import.meta.resolve('@testdog/engine/platform/web/observationView'));
    const actions = fileURLToPath(import.meta.resolve('@testdog/engine/platform/web/webActions'));
    const recorder = fileURLToPath(
      import.meta.resolve('@testdog/engine/platform/web/recordingLocator'),
    );
    const entry = join(directory, 'observe.mjs');

    await writeFile(
      entry,
      `
    import { chromium } from 'playwright';
    import { Observer } from ${JSON.stringify(observer)};
    import { observationView } from ${JSON.stringify(view)};
    import { executeWebAction } from ${JSON.stringify(actions)};
    import { recordAction } from ${JSON.stringify(recorder)};
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setContent(
        '<button>Background</button><label>Dimension<input></label>' +
        '<div data-testid="import"><h2>Import form</h2><label>Dimension<input></label><button>Confirm import</button></div>' +
        '<div><h2>Choices</h2>' +
        '<button>Rendered option</button></div>'
      );
      const observer = new Observer();
      const overview = observationView((await observer.observe(page)).tree);
      const pending = [...overview.tree];
      let region;
      while (pending.length) {
        const node = pending.shift();
        if (node.ref && node.children?.some(child => child.role === 'heading' && child.name === 'Import form')) {
          region = node;
          break;
        }
        pending.push(...(node.children || []));
      }
      if (!region) throw new Error('Import region missing from overview');
      const observation = await observer.observe(page, { ref: region.ref });
      const selected = observationView(observation.tree, observation.requestedRegion);
      const action = { type: 'fill', value: 'test', target: { kind: 'label', value: 'Dimension', name: '', scope: { kind: 'ariaRef', value: region.ref, name: '' } } };
      const recorded = await recordAction(page, action);
      await executeWebAction(page, action);
      console.log(JSON.stringify({
        fullBackground: JSON.stringify(observation.tree).includes('Background'),
        scopedBackground: JSON.stringify(selected.tree).includes('Background'),
        scopedOption: JSON.stringify(selected.tree).includes('Rendered option'),
        overviewOption: JSON.stringify(selected.overview).includes('Rendered option'),
        scopedValue: await page.getByTestId('import').getByLabel('Dimension').inputValue(),
        backgroundValue: await page.locator('body > label input').inputValue(),
        replayable: recorded.replayable,
      }));
    } finally {
      await browser.close();
    }
  `,
    );
    let script = entry;

    if (runtime === 'bundle') {
      script = join(directory, 'observe.bundle.mjs');
      await build({
        entryPoints: [entry],
        outfile: script,
        bundle: true,
        platform: 'node',
        target: 'node24',
        format: 'esm',
        external: ['playwright'],
        absWorkingDir: dirname(entry),
      });
    }

    const args = runtime === 'tsx' ? ['--import', import.meta.resolve('tsx'), script] : [script];
    const { stdout } = await execute(process.execPath, args, { timeout: 15000 });

    expect(JSON.parse(stdout.trim())).toEqual({
      fullBackground: true,
      scopedBackground: false,
      scopedOption: false,
      overviewOption: true,
      scopedValue: 'test',
      backgroundValue: '',
      replayable: true,
    });
  },
  20000,
);
