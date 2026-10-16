import type { Page } from 'playwright';
import type { Target, Step } from '@testdog/contracts/automation/compiler/schema';
import type { WebAction } from '@testdog/contracts/automation/platform/contracts';
import type { RecordedAction } from '@testdog/contracts/automation/platform/web/types';
import { locateWebElement } from '@testdog/automation/platform/web/webLocator';

export function recordAction(
  page: Page,
  action: Step,
): Promise<{ action: RecordedAction; replayable: boolean }>;
export function recordAction(
  page: Page,
  action: WebAction,
): Promise<{ action: WebAction & { sensitive?: boolean }; replayable: boolean }>;

export async function recordAction(
  page: Page,
  action: WebAction,
): Promise<{ action: WebAction & { sensitive?: boolean }; replayable: boolean }> {
  if (
    action.type === 'plugin' ||
    action.type === 'wait' ||
    action.type === 'navigate' ||
    action.type === 'screenshot'
  )
    return { action, replayable: true };
  const original = locateWebElement(page, action.target);
  const handle = await original.elementHandle({ timeout: 3000 });

  if (!handle) return { action, replayable: false };
  try {
    const sensitive = await handle.evaluate(
      (element) => element instanceof HTMLInputElement && element.type === 'password',
    );
    let target = action.target;
    let replayable = false;

    try {
      const normalized = await original.normalize();
      // Playwright exposes normalize(), but no public selector serialization API.
      // Persist its selector rather than parsing the human-readable toString() output.
      const selector = (normalized as typeof normalized & { _selector: string })._selector;

      if (typeof selector !== 'string' || !selector || selector.includes('aria-ref='))
        throw new Error('Normalization did not produce a durable selector');
      const candidate: Target = { kind: 'css', value: selector, name: '' };
      const found = locateWebElement(page, candidate);

      if (
        (await found.count()) === 1 &&
        (await found.evaluate((element, reference) => element === reference, handle))
      ) {
        target = candidate;
        replayable = true;
      }
    } catch {
      // Keep the original target for execution, but do not offer deterministic replay.
    }

    return { action: { ...action, target, sensitive }, replayable };
  } finally {
    await handle.dispose();
  }
}
