import type { Frame, Page } from 'playwright';
import type { WaitStep } from '@testdog/contracts/automation/compiler/schema';
import type { Observer } from '@testdog/automation/platform/web/observer';

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const navigationRace = (error: unknown) =>
  /Execution context was destroyed|Cannot find context with specified id/.test(String(error));

export class BrowserSession {
  private active: Page;
  private actionPage: Page;
  private revision = 0;
  private readonly pages = new Set<Page>();

  constructor(page: Page) {
    this.active = this.actionPage = page;
    for (const tab of page.context().pages()) this.track(tab);
    page.context().on('page', this.opened);
  }

  get page() {
    if (this.active.isClosed()) throw new Error('No open page in browser session');

    return this.active;
  }

  get version() {
    return this.revision;
  }

  activate(page: Page) {
    if (!this.pages.has(page) || page.isClosed())
      throw new Error('Requested page is not open in this browser session');
    if (this.active !== page) {
      this.active = page;
      this.revision++;
    }
  }

  private track(page: Page) {
    this.pages.add(page);
    page.on('close', this.closed);
    page.on('framenavigated', this.navigated);
  }

  private opened = (page: Page) => {
    this.track(page);
    this.active = page;
    this.revision++;
  };

  private closed = (page: Page) => {
    if (page !== this.active) return;
    this.active = [...this.pages].filter((tab) => !tab.isClosed()).at(-1) ?? page;
    this.revision++;
  };

  private navigated = (frame: Frame) => {
    if (frame.page() === this.active && frame === this.active.mainFrame()) this.revision++;
  };

  async perform(action: (page: Page) => Promise<unknown>) {
    const revision = this.revision;

    this.actionPage = this.page;
    await action(this.page);

    return revision !== this.revision;
  }

  async observe(observer: Observer) {
    const deadline = Date.now() + 5000;

    do {
      const page = this.page;
      const revision = this.revision;

      try {
        const observation = await observer.observe(page);

        if (page === this.page && revision === this.revision) return observation;
      } catch (error) {
        if (page === this.active && !navigationRace(error)) throw error;
      }

      await pause(50);
    } while (Date.now() < deadline);

    throw new Error(`Page kept changing during observation: ${this.page.url()}`);
  }

  async wait(step: WaitStep) {
    if (step.condition === 'observe') return pause(step.timeoutMs);
    const deadline = Date.now() + step.timeoutMs;

    do {
      const page = this.page;

      try {
        const ready =
          step.condition === 'newPage'
            ? page !== this.actionPage
            : step.condition === 'url'
              ? page.url().includes(step.value)
              : await page.getByText(step.value).filter({ visible: true }).first().isVisible();

        if (ready && page === this.page) return;
      } catch (error) {
        if (page === this.active && !navigationRace(error)) throw error;
      }

      await pause(Math.min(100, Math.max(0, deadline - Date.now())));
    } while (Date.now() < deadline);
    // A wait expiring is inconclusive; the next observation determines what happened.
  }

  dispose() {
    this.active.context().off('page', this.opened);
    for (const page of this.pages) {
      page.off('close', this.closed);
      page.off('framenavigated', this.navigated);
    }
  }
}
