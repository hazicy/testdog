import { chromium, errors, type Browser, type Page } from 'playwright';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserSession } from './browserSession';
import { Observer } from './observer';
import { waitForObservationReady } from './pageReadiness';

describe('BrowserSession', () => {
  let browser: Browser;
  let page: Page;
  let session: BrowserSession;
  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });
  beforeEach(async () => {
    page = await browser.newPage();
    session = new BrowserSession(page);
  });
  afterEach(async () => {
    session.dispose();
    await page.context().close();
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    await browser.close();
  });

  it('follows a delayed popup even between actions and observations', async () => {
    await session.perform((current) =>
      current.evaluate(() => {
        setTimeout(() => window.open('about:blank'), 100);
      }),
    );
    await session.wait({ type: 'wait', condition: 'newPage', value: '', timeoutMs: 1000 });
    const popup = session.page;
    expect(popup).not.toBe(page);
    await popup.setContent('<h1>Video player</h1>');
    const observation = await session.observe(new Observer());
    expect(JSON.stringify(observation.tree)).toContain('Video player');
    await popup.close();
    expect(session.page).toBe(page);
  });

  it.each([false, true])(
    'waits for login results without replaying the click (redirect: %s)',
    async (redirect) => {
      await page.context().route('https://session.test/**', async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path === '/data') {
          await new Promise((resolve) => setTimeout(resolve, 300));
          await route.fulfill({ body: 'ok' });
        } else {
          await route.fulfill({
            contentType: 'text/html',
            body:
              path === '/home'
                ? '<h1>Logged in</h1>'
                : `<button onclick="this.remove(); fetch('/data').then(() => {
            ${redirect ? "location.href = '/home'" : "document.body.innerHTML = '<h1>Logged in</h1>'"}
          })">Login</button>`,
          });
        }
      });
      await page.goto('https://session.test/login');
      await session.perform((current) => current.getByRole('button').click());
      await session.wait({ type: 'wait', condition: 'text', value: 'Logged in', timeoutMs: 1000 });
      const observation = await session.observe(new Observer());
      expect(JSON.stringify(observation.tree)).toContain('Logged in');
      if (redirect) expect(observation.page.url).toBe('https://session.test/home');
    },
  );

  it('observes a live page with continuous DOM updates and a pending background request', async () => {
    await page.route('https://session.test/poll', () => undefined);
    await page.setContent(`<h1>Video player</h1><span id="progress"></span><script>
      fetch('https://session.test/poll');
      let tick = 0;
      setInterval(() => document.querySelector('#progress').textContent = String(++tick), 20);
    </script>`);
    await session.wait({ type: 'wait', condition: 'text', value: 'Video player', timeoutMs: 1000 });
    expect(JSON.stringify((await session.observe(new Observer())).tree)).toContain('Video player');
  });

  it('waits for a URL change and reobserves when an expected result is absent', async () => {
    await page.route('https://session.test/start', (route) => route.fulfill({ body: '' }));
    await page.goto('https://session.test/start');
    await page.setContent('<h1>Loading</h1>');
    await session.perform((current) =>
      current.evaluate(() => {
        setTimeout(() => history.pushState({}, '', '#ready'), 100);
      }),
    );
    await session.wait({ type: 'wait', condition: 'url', value: '#ready', timeoutMs: 1000 });
    expect(session.page.url()).toContain('#ready');
    await session.wait({
      type: 'wait',
      condition: 'text',
      value: 'Missing result',
      timeoutMs: 100,
    });
    expect(JSON.stringify((await session.observe(new Observer())).tree)).toContain('Loading');
  });

  it('discards an observation if its page changes during capture', async () => {
    const observer = new Observer();
    const read = vi.spyOn(observer, 'observe');
    read.mockImplementationOnce(async () => {
      const popup = page.waitForEvent('popup');
      await page.evaluate(() => window.open('about:blank'));
      await popup;
      return { tree: {}, page: { url: 'stale', focused: null } };
    });
    read.mockResolvedValueOnce({ tree: {}, page: { url: 'fresh', focused: null } });
    expect((await session.observe(observer)).page.url).toBe('fresh');
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('reports an empty session and cleans up its listeners', async () => {
    const context = page.context();
    const contextOff = vi.spyOn(context, 'off');
    const pageOff = vi.spyOn(page, 'off');
    await page.close();
    expect(() => session.page).toThrow('No open page');
    session.dispose();
    expect(contextOff).toHaveBeenCalledWith('page', expect.any(Function));
    expect(pageOff).toHaveBeenCalledWith('close', expect.any(Function));
    expect(pageOff).toHaveBeenCalledWith('framenavigated', expect.any(Function));
  });

  it('tolerates readiness timeouts without swallowing action or capture errors', async () => {
    const load = vi.spyOn(page, 'waitForLoadState');
    load.mockRejectedValueOnce(new errors.TimeoutError('Still loading'));
    await expect(waitForObservationReady(page, 20)).resolves.toBeUndefined();
    await expect(
      session.perform(async () => {
        throw new Error('Click failed');
      }),
    ).rejects.toThrow('Click failed');
    const observer = new Observer();
    vi.spyOn(observer, 'observe').mockRejectedValue(new Error('Capture failed'));
    await expect(session.observe(observer)).rejects.toThrow('Capture failed');
  });
});
