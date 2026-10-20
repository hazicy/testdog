import { defaultWebTarget } from '@testdog/contracts/execution/target';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, expect, it, vi } from 'vitest';
import { chromium, type BrowserServer } from 'playwright';
import type { TestRun } from '@testdog/contracts/runs/types';

const store = vi.hoisted(() => ({
  insertArtifact: vi.fn(),
  insertStep: vi.fn(),
  finishStep: vi.fn(),
  appendBrowserLogs: vi.fn(),
}));

vi.mock('@testdog/server/runs/repository', () => store);
vi.mock('@testdog/server/realtime/preview', () => ({
  hasPreviewViewers: async () => false,
  publishPreview: vi.fn(),
  previewInterval: () => 3000,
}));
import { RunRecorder } from '@testdog/server/execution/recording/webRecorder';
import { browserlessProvider } from '@testdog/engine/platform/web/providers/browserless';

let server: BrowserServer | undefined;
let directory: string | undefined;

afterEach(async () => {
  await server?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it.each([false, true])(
  'archives native remote evidence (interrupted=%s)',
  async (interrupted) => {
    directory = await mkdtemp(join(tmpdir(), 'testdog-remote-browser-'));
    vi.stubEnv('TESTDOG_DATA_DIR', directory);
    // The real Playwright server exercises native transport and remote video transfer without cloud credentials.
    server = await chromium.launchServer({ headless: true, wsPath: '/chromium/playwright' });
    const connection = await browserlessProvider.connect(
      {
        schemaVersion: 1,
        platform: 'web',
        browser: 'chromium',
        deviceProfile: 'legacy-desktop',
        url: 'https://example.com',
      },
      { endpoint: server.wsEndpoint() },
      new AbortController().signal,
    );

    try {
      const run = {
        id: 'remote-run',
        startedAt: new Date().toISOString(),
        targetSnapshot: defaultWebTarget('https://example.com'),
      } as TestRun;
      const recorder = new RunRecorder(run);
      const context = await connection.browser.newContext({
        viewport: { width: 320, height: 240 },
        recordVideo: { dir: join(directory, 'remote-video') },
      });

      await recorder.start(context, connection.artifacts);
      const page = await context.newPage();

      await page.setContent('<h1>Remote recording</h1>');
      expect(await page.locator('h1').innerText()).toBe('Remote recording');
      await expect(page.video()!.path()).rejects.toThrow(
        'Path is not available when connecting remotely',
      );
      await recorder.capture(page, 'before');
      if (interrupted) await context.close();
      await recorder.stop(context, interrupted);
      const artifacts = store.insertArtifact.mock.calls;

      expect(artifacts.map(([artifact]) => artifact.kind)).toEqual(
        expect.arrayContaining(
          interrupted ? ['screenshot', 'video'] : ['screenshot', 'trace', 'video'],
        ),
      );
      for (const [artifact, path] of artifacts) {
        const bytes = await readFile(path);

        expect(bytes.length).toBeGreaterThan(0);
        expect(artifact.size).toBe(bytes.length);
      }
    } finally {
      await connection.close();
    }
  },
  30000,
);
