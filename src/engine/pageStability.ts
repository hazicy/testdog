import type { Frame, Page, Request } from 'playwright';

const relevantRequests = new Set(['document', 'script', 'stylesheet', 'fetch', 'xhr']);

export async function performAndWaitForStablePage(
  page: Page,
  action: () => Promise<unknown>,
  timeout = 15000,
  quietMs = 500,
): Promise<void> {
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

  // Attach before the action so a slow login request cannot be missed.
  page.on('request', started);
  page.on('requestfinished', finished);
  page.on('requestfailed', finished);
  page.on('framenavigated', navigated);
  try {
    await action();
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (pending.size || Date.now() - lastActivity < quietMs) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(50, deadline - Date.now())));
        continue;
      }
      await page.waitForLoadState('domcontentloaded', { timeout: deadline - Date.now() });
      const activityBefore = activityVersion;
      try {
        const quiet = await page.evaluate(
          ({ quietMs, remaining }) =>
            new Promise<boolean>((resolve) => {
              let quietTimer: ReturnType<typeof setTimeout>;
              let observer: MutationObserver;
              const finish = (result: boolean) => {
                clearTimeout(quietTimer);
                clearTimeout(deadlineTimer);
                observer.disconnect();
                resolve(result);
              };
              const deadlineTimer = setTimeout(() => finish(false), remaining);
              observer = new MutationObserver(() => {
                clearTimeout(quietTimer);
                quietTimer = setTimeout(() => finish(true), quietMs);
              });
              observer.observe(document.documentElement, {
                childList: true,
                subtree: true,
                attributes: true,
                characterData: true,
              });
              quietTimer = setTimeout(() => finish(true), quietMs);
            }),
          { quietMs, remaining: Math.max(1, deadline - Date.now()) },
        );
        if (quiet && pending.size === 0 && activityVersion === activityBefore) return;
      } catch (error) {
        // A redirect can destroy the old document while it is being observed.
        if (!String(error).includes('Execution context was destroyed')) throw error;
        markActivity();
      }
    }
    throw new Error(
      `Page did not stabilize within ${timeout}ms (${pending.size} pending requests)`,
    );
  } finally {
    page.off('request', started);
    page.off('requestfinished', finished);
    page.off('requestfailed', finished);
    page.off('framenavigated', navigated);
  }
}
