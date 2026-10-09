import { chromium, errors, type Browser, type Page } from 'playwright';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { performAndWaitForStablePage, waitForObservationReady } from './pageStability';
import { Observer } from './observer';

describe('page stability after asynchronous login', () => {
  let browser: Browser;
  let page: Page;
  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });
  beforeEach(async () => {
    page = await browser.newPage();
    vi.spyOn(page, 'off');
  });
  afterEach(async () => {
    await page?.context().close();
  });
  afterAll(async () => {
    await browser?.close();
  });

  async function loginPage(redirect: boolean, delay = 900, earlyUrlChange = false) {
    const loginPage = page;
    await page.route('https://stability.test/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/session') {
        await new Promise((resolve) => setTimeout(resolve, delay));
        if (loginPage.isClosed()) return;
        await route.fulfill({ body: 'ok' });
      } else if (path === '/home') {
        await route.fulfill({ contentType: 'text/html', body: '<h1>Chatbot</h1>' });
      } else {
        await route.fulfill({
          contentType: 'text/html',
          body: `<button onclick="login()">Login</button><script>
            async function login() {
              document.body.querySelector('button').remove();
              ${earlyUrlChange ? "history.pushState({}, '', '/home');" : ''}
              await fetch('/session');
              ${redirect ? "location.href = '/home';" : "document.body.innerHTML = '<h1>Chatbot</h1>';"}
            }
          </script>`,
        });
      }
    });
    await page.goto('https://stability.test/login');
  }

  it.each([false, true])(
    'waits through an empty page until login finishes (redirect: %s)',
    async (redirect) => {
      await loginPage(redirect);
      await performAndWaitForStablePage(page, () => page.getByRole('button').click());
      expect(await page.evaluate(() => document.body.textContent)).toBe('Chatbot');
      expect(page.url()).toBe(`https://stability.test/${redirect ? 'home' : 'login'}`);
      expect(page.off).toHaveBeenCalledTimes(5);
    },
    20000,
  );

  it('keeps waiting for login requests after a SPA changes its URL', async () => {
    await loginPage(false, 900, true);
    await performAndWaitForStablePage(page, () => page.getByRole('button').click());
    expect(await page.evaluate(() => document.body.textContent)).toBe('Chatbot');
  });

  it.each([false, true])(
    'returns the new tab after its asynchronous content stabilizes (delayed open: %s)',
    async (delayed) => {
      const context = page.context();
      const contextOff = vi.spyOn(context, 'off');
      await context.route('https://tabs.test/**', async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path === '/data') {
          await new Promise((resolve) => setTimeout(resolve, 900));
          await route.fulfill({ body: 'New tab ready' });
        } else if (path === '/new') {
          await route.fulfill({
            contentType: 'text/html',
            body: `<script>fetch('/data').then(r => r.text()).then(text => {
              document.body.innerHTML = '<h1>' + text + '</h1>';
            });</script>`,
          });
        } else {
          await route.fulfill({
            contentType: 'text/html',
            body: delayed
              ? `<button onclick="setTimeout(() => window.open('/new'), 100)">Open</button>`
              : '<a href="/new" target="_blank">Open</a>',
          });
        }
      });
      await page.goto('https://tabs.test/start');

      const active = await performAndWaitForStablePage(page, () =>
        page.getByText('Open', { exact: true }).click(),
      );

      expect(active).not.toBe(page);
      expect(active.url()).toBe('https://tabs.test/new');
      expect(await active.locator('body').innerText()).toBe('New tab ready');
      expect(contextOff).toHaveBeenCalledWith('page', expect.any(Function));
      expect(page.off).toHaveBeenCalledTimes(5);
    },
  );

  it('returns to the previous tab when the active popup closes', async () => {
    await page.goto('about:blank');
    const popupPromise = page.waitForEvent('popup');
    await page.evaluate(() => window.open('about:blank'));
    const popup = await popupPromise;

    const active = await performAndWaitForStablePage(popup, () => popup.close());

    expect(active).toBe(page);
  });

  it('allows observation of a video tab whose DOM keeps updating', async () => {
    await page.context().route('https://video.test/**', async (route) => {
      await route.fulfill({
        contentType: 'text/html',
        body: `<h1>Video player</h1><span id="progress"></span><script>
          let tick = 0;
          setInterval(() => {
            document.querySelector('#progress').textContent = String(++tick);
            document.body.style.setProperty('--progress', String(tick));
          }, 50);
        </script>`,
      });
    });
    await page.setContent(
      '<button onclick="window.open(\'https://video.test/watch\')">Play</button>',
    );

    const active = await performAndWaitForStablePage(
      page,
      () => page.getByRole('button', { name: 'Play' }).click(),
      5000,
    );

    expect(active).not.toBe(page);
    expect(await active.getByRole('heading').innerText()).toBe('Video player');
    expect(Number(await active.locator('#progress').innerText())).toBeGreaterThan(0);
    const observation = await new Observer().observe(active);
    expect(observation.page.url).toBe('https://video.test/watch');
    expect(JSON.stringify(observation.tree)).toContain('Video player');
  });

  it('allows observation after the settling budget while requests and DOM updates continue', async () => {
    await loginPage(false, 2000);
    await page.evaluate(() => {
      let tick = 0;
      setInterval(() => document.body.style.setProperty('--tick', String(++tick)), 20);
    });

    const active = await performAndWaitForStablePage(
      page,
      () => page.getByRole('button').click(),
      200,
      50,
    );
    expect(active).toBe(page);
    // Settling ending is not proof of login success: observe the actual current content.
    expect(await active.locator('body').innerText()).not.toContain('Chatbot');
  });

  it('returns the page when a request outlives the settling budget', async () => {
    await loginPage(false, 2000);
    const active = await performAndWaitForStablePage(
      page,
      () => page.getByRole('button').click(),
      200,
      50,
    );
    expect(active).toBe(page);
    expect(page.off).toHaveBeenCalledTimes(5);
  });

  it('does not suppress action failures while settling is best-effort', async () => {
    await expect(
      performAndWaitForStablePage(page, async () => {
        throw new Error('Click failed');
      }),
    ).rejects.toThrow('Click failed');
    expect(page.off).toHaveBeenCalledTimes(5);
  });

  it('tolerates load-state timeouts but propagates other errors', async () => {
    const load = vi.spyOn(page, 'waitForLoadState');
    load.mockRejectedValueOnce(new errors.TimeoutError('Still loading'));
    await expect(waitForObservationReady(page, 20)).resolves.toBeUndefined();
    expect(load).toHaveBeenCalledWith('domcontentloaded', { timeout: 20 });

    load.mockRejectedValueOnce(new Error('Page closed'));
    await expect(waitForObservationReady(page, 20)).rejects.toThrow('Page closed');
  });
});
