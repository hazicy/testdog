import { afterEach, describe, expect, it, vi } from 'vitest';
import { launchWebBrowser, resolveWebProfile } from '@testdog/automation/platform/web/mobile';
import {
  legacyWebTarget,
  TestTargetSchema,
  type WebTarget,
} from '@testdog/contracts/automation/platform/target';

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

  it('preserves legacy desktop and rejects mismatched profiles and native URLs', () => {
    expect(resolveWebProfile(legacyWebTarget('https://example.com')).viewport).toEqual({
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
