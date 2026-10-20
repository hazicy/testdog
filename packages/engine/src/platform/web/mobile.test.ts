import { afterEach, describe, expect, it, vi } from 'vitest';
import { launchWebBrowser, resolveWebProfile } from '@testdog/engine/platform/web/mobile';
import { TestTargetSchema, type WebTarget } from '@testdog/contracts/execution/target';

afterEach(() => vi.unstubAllEnvs());
describe('mobile browser environments', () => {
  for (const [browser, deviceProfile] of [
    ['chromium', 'Pixel 7'],
    ['webkit', 'iPhone 13'],
  ] as const) {
    it(`runs ${deviceProfile} with ${browser} touch events and resolved device parameters`, async () => {
      vi.stubEnv('AUTOMATION_HEADLESS', 'true');
      const target = TestTargetSchema.parse({
        platform: 'web',
        url: 'https://example.com',
        browser,
        deviceProfile,
      }) as WebTarget;
      const profile = resolveWebProfile(target);
      const instance = await launchWebBrowser(target);

      try {
        const context = await instance.newContext(profile);
        const page = await context.newPage();

        await page.setContent(
          '<meta name="viewport" content="width=device-width,initial-scale=1"><button>Tap</button><output></output><script>document.querySelector("button").addEventListener("touchstart",()=>document.querySelector("output").textContent="touched")</script>',
        );
        await page.getByRole('button').tap();
        expect(await page.locator('output').textContent()).toBe('touched');
        const environment = await page.evaluate(() => ({
          width: innerWidth,
          ua: navigator.userAgent,
          touch: navigator.maxTouchPoints,
          scale: devicePixelRatio,
        }));

        expect(environment.width).toBe(profile.viewport!.width);
        expect(environment.ua).toBe(profile.userAgent);
        expect(environment.scale).toBe(profile.deviceScaleFactor);
        expect(profile.hasTouch).toBe(true);
        if (browser === 'chromium') expect(environment.touch).toBeGreaterThan(0);
      } finally {
        await instance.close();
      }
    }, 30000);
  }

  for (const [browser, deviceProfile] of [
    ['chromium', 'legacy-desktop'],
    ['chromium', 'Pixel 7'],
    ['webkit', 'iPhone 13'],
  ] as const) {
    it(`applies a custom UA to navigator and HTTP requests for ${deviceProfile}`, async () => {
      vi.stubEnv('AUTOMATION_HEADLESS', 'true');
      const target = TestTargetSchema.parse({
        platform: 'web',
        browser,
        deviceProfile,
        userAgent: 'Caseforge-Test/1.0',
      }) as WebTarget;
      const profile = resolveWebProfile(target);
      const defaults = resolveWebProfile({ ...target, userAgent: undefined });
      const instance = await launchWebBrowser(target);

      try {
        const context = await instance.newContext(profile);
        const page = await context.newPage();
        const url = 'https://ua.test/';

        await page.route(url, (route) =>
          route.fulfill({ contentType: 'text/html', body: '<title>UA</title>' }),
        );
        const [request] = await Promise.all([page.waitForRequest(url), page.goto(url)]);

        expect(await request.headerValue('user-agent')).toBe(target.userAgent);
        expect(await page.evaluate(() => navigator.userAgent)).toBe(target.userAgent);
        expect(profile.viewport).toEqual(defaults.viewport);
        expect(profile.hasTouch).toBe(defaults.hasTouch);
      } finally {
        await instance.close();
      }
    }, 30000);
  }

  it('rejects empty, multiline and oversized UA values', () => {
    for (const userAgent of ['', '   ', 'Test\r\nInjected: value', 'a'.repeat(2049)]) {
      expect(TestTargetSchema.safeParse({ platform: 'web', userAgent }).success).toBe(false);
    }
  });

  it('preserves legacy desktop and rejects mismatched profiles and native URLs', () => {
    expect(
      resolveWebProfile({
        schemaVersion: 1,
        platform: 'web',
        url: 'https://example.com',
        browser: 'chromium',
        deviceProfile: 'legacy-desktop',
      }).viewport,
    ).toEqual({
      width: 1280,
      height: 800,
    });
    expect(
      TestTargetSchema.safeParse({
        platform: 'web',
        url: 'https://example.com',
        browser: 'chromium',
        deviceProfile: 'iPhone 13',
      }).success,
    ).toBe(false);
    expect(
      TestTargetSchema.safeParse({
        platform: 'android',
        appId: 'com.example.app',
        deviceProfileId: 'pixel',
        url: 'https://example.com',
      }).success,
    ).toBe(false);
    expect(
      TestTargetSchema.parse({
        platform: 'ios',
        appId: 'com.example.app',
        deviceProfileId: 'iphone',
      }),
    ).toMatchObject({ resetPolicy: 'preserve', schemaVersion: 1 });
  });
});
