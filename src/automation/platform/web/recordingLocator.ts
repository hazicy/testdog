import type { Page } from 'playwright';
import type { Target, Step } from '../../compiler/schema';
import type { RecordedAction } from './types';
import { locateWebElement } from './webLocator';

export async function recordAction(
  page: Page,
  action: Step,
): Promise<{ action: RecordedAction; replayable: boolean }> {
  if (action.type === 'wait' || action.type === 'navigate' || action.type === 'screenshot')
    return { action, replayable: true };
  const original = locateWebElement(page, action.target);
  const handle = await original.elementHandle({ timeout: 3000 });

  if (!handle) return { action, replayable: false };
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
    for (const candidate of candidates) {
      const target = { ...candidate, name: candidate.name || '' } as Target;

      try {
        const found = locateWebElement(page, target);

        if (
          (await found.count()) === 1 &&
          (await found.evaluate((element, reference) => element === reference, handle))
        )
          return { action: { ...action, target, sensitive }, replayable: true };
      } catch {
        /* Try another stable descriptor. */
      }
    }

    return { action: { ...action, sensitive }, replayable: false };
  } finally {
    await handle.dispose();
  }
}
