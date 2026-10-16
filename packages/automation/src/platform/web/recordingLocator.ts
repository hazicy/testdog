import type { Page } from 'playwright';
import type { Target, Step } from '@testdog/contracts/automation/compiler/schema';
import type { RecordedAction } from '@testdog/contracts/automation/platform/web/types';
import { locateWebElement } from '@testdog/automation/platform/web/webLocator';

export async function recordAction(
  page: Page,
  action: Step,
): Promise<{ action: RecordedAction; replayable: boolean }> {
  if (action.type === 'wait' || action.type === 'navigate' || action.type === 'screenshot')
    return { action, replayable: true };
  const recorded = await recordTarget(page, action.target);

  return {
    action: { ...action, target: recorded.target, sensitive: recorded.sensitive },
    replayable: recorded.stable,
  };
}

async function recordTarget(
  page: Page,
  target: Target,
): Promise<{ target: Target; stable: boolean; sensitive?: boolean }> {
  const original = locateWebElement(page, target);
  const handle = await original.elementHandle({ timeout: 3000 });

  if (!handle) return { target, stable: false };
  try {
    const { candidates, sensitive } = await original.evaluate((element) => {
      const candidates: { kind: string; value: string; name?: string }[] = [];
      const testId = element.getAttribute('data-testid');

      if (testId) candidates.push({ kind: 'testId', value: testId });
      const labels =
        'labels' in element ? Array.from((element as HTMLInputElement).labels || []) : [];

      for (const label of labels)
        if (label.textContent?.trim())
          candidates.push({ kind: 'label', value: label.textContent.trim() });
      const aria = element.getAttribute('aria-label');

      if (aria) candidates.push({ kind: 'label', value: aria });
      const tag = element.tagName.toLowerCase();
      const role =
        element.getAttribute('role') ||
        (tag === 'button'
          ? 'button'
          : tag === 'a'
            ? 'link'
            : tag === 'select'
              ? 'combobox'
              : tag === 'textarea' || tag === 'input'
                ? 'textbox'
                : '');
      const name = aria || element.textContent?.trim();

      if (role && name) candidates.push({ kind: 'role', value: role, name });
      const placeholder = element.getAttribute('placeholder');

      if (placeholder) candidates.push({ kind: 'placeholder', value: placeholder });
      if (element.id) candidates.push({ kind: 'css', value: `#${CSS.escape(element.id)}` });
      for (const attribute of ['name', 'href', 'aria-label']) {
        const value = element.getAttribute(attribute);

        if (value)
          candidates.push({ kind: 'css', value: `${tag}[${attribute}="${CSS.escape(value)}"]` });
      }

      return {
        candidates,
        sensitive: element instanceof HTMLInputElement && element.type === 'password',
      };
    });

    // A selector is usable only when it uniquely identifies the actual recorded element.
    const scopes: (Target['scope'] | undefined)[] = [undefined];

    if (target.scope) {
      const scope = await recordTarget(page, target.scope);

      if (scope.stable) scopes.push(scope.target);
    }

    for (const scope of scopes) {
      for (const candidate of candidates) {
        const descriptor = {
          ...candidate,
          name: candidate.name || '',
          ...(scope ? { scope } : {}),
        } as Target;

        try {
          const found = locateWebElement(page, descriptor);

          if (
            (await found.count()) === 1 &&
            (await found.evaluate((element, reference) => element === reference, handle))
          )
            return { target: descriptor, sensitive, stable: true };
        } catch {
          /* Try another stable descriptor. */
        }
      }
    }

    return { target, sensitive, stable: false };
  } finally {
    await handle.dispose();
  }
}
