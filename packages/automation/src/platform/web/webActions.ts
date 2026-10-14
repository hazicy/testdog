import type { Page } from 'playwright';
import type { Step } from '@testdog/contracts/automation/compiler/schema';
import { locateWebElement } from '@testdog/automation/platform/web/webLocator';

export async function executeWebAction(
  page: Page,
  step: Exclude<Step, { type: 'wait' }>,
  useTouch = false,
): Promise<void> {
  if (step.type === 'screenshot') {
    await page.screenshot();
    // The session recorder archives the corresponding before/after image.

    return;
  }

  if (step.type === 'navigate') {
    await page.goto(step.value, { waitUntil: 'domcontentloaded' });

    return;
  }

  const target = locateWebElement(page, step.target);

  if (step.type === 'click') {
    if (useTouch) await target.tap();
    else await target.click();
  } else if (step.type === 'fill') {
    await target.fill(step.value);
  } else if (step.type === 'press') {
    // Playwright 的 press 值支持大写
    const key = step.value.charAt(0).toUpperCase() + step.value.slice(1);

    await target.press(key);
  }
}
