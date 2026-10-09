import { errors, type Frame, type Page, type Request } from 'playwright';

const relevantRequests = new Set(['document', 'script', 'stylesheet', 'fetch', 'xhr']);
// Like tester-army/e2e's observation capture, settling is best-effort.
// It must leave time to read live pages with polling or continuously changing DOM.
const settleTimeoutMs = 5000;

export async function waitForObservationReady(page: Page, timeout = settleTimeoutMs) {
  try {
    await page.waitForLoadState('domcontentloaded', { timeout: Math.max(1, timeout) });
  } catch (error) {
    if (!(error instanceof errors.TimeoutError)) throw error;
  }
}

export async function performAndWaitForStablePage(
  page: Page,
  action: () => Promise<unknown>,
  timeout = 15000,
  quietMs = 500,
): Promise<Page> {
  const context = page.context();
  let activePage = page;
  const pending = new Set<Request>();
  let lastActivity = Date.now();
  let activityVersion = 0;
  const markActivity = () => {
    lastActivity = Date.now();
    activityVersion++;
  };
  const started = (request: Request) => {
    if (!relevantRequests.has(request.resourceType())) return;
    pending.add(request);
    markActivity();
  };
  const finished = (request: Request) => {
    if (pending.delete(request)) markActivity();
  };
  const navigated = (frame: Frame) => {
    // Requests from the old document can disappear without a completion event.
    const replacesDocument = [...pending].some(
      (request) => request.isNavigationRequest() && request.frame() === frame,
    );
    if (replacesDocument) {
      for (const request of pending) {
        if (!request.isNavigationRequest() && request.frame() === frame) pending.delete(request);
      }
    }
    markActivity();
  };

  const attach = (target: Page) => {
    target.on('request', started);
    target.on('requestfinished', finished);
    target.on('requestfailed', finished);
    target.on('framenavigated', navigated);
    target.on('close', closed);
  };
  const detach = (target: Page) => {
    target.off('request', started);
    target.off('requestfinished', finished);
    target.off('requestfailed', finished);
    target.off('framenavigated', navigated);
    target.off('close', closed);
  };
  const activate = (target: Page) => {
    detach(activePage);
    pending.clear();
    activePage = target;
    attach(target);
    markActivity();
  };
  const opened = (target: Page) => {
    if (!target.isClosed()) activate(target);
  };
  const closed = () => {
    const remaining = context.pages().filter((target) => !target.isClosed());
    const target = remaining.at(-1);
    if (target) activate(target);
  };

  // Listen before acting: a click can create a new tab before it resolves.
  context.on('page', opened);
  attach(activePage);
  try {
    await action();
    const deadline = Date.now() + Math.min(timeout, settleTimeoutMs);
    while (true) {
      if (Date.now() < deadline && (pending.size || Date.now() - lastActivity < quietMs)) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(50, deadline - Date.now())));
        continue;
      }
      const observedPage = activePage;
      const activityBefore = activityVersion;
      try {
        await waitForObservationReady(observedPage, deadline - Date.now());
      } catch (error) {
        if (observedPage !== activePage) continue;
        throw error;
      }
      if (observedPage !== activePage) continue;
      if (Date.now() >= deadline || (pending.size === 0 && activityVersion === activityBefore))
        return activePage;
      // Navigation or a new request raced the load check. Settle within the same budget.
    }
  } finally {
    context.off('page', opened);
    detach(activePage);
  }
}
