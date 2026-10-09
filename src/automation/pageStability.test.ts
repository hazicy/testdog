import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { performAndWaitForStablePage } from './pageStability';

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

  it('reports a timeout instead of observing a page with a pending login request', async () => {
    await loginPage(false, 2000);
    await expect(
      performAndWaitForStablePage(page, () => page.getByRole('button').click(), 200, 50),
    ).rejects.toThrow('Page did not stabilize');
    expect(page.off).toHaveBeenCalledTimes(5);
  });
});
