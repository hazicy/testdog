import type { Page } from 'playwright';
import type { Step } from '../../compiler/schema';
import { locateWebElement } from './webLocator';

export async function executeWebAction(
  page: Page,
  step: Exclude<Step, { type: 'wait' }>,
  useTouch = false,
): Promise<void> {
  // 执行操作
  if (step.type === 'navigate') {
    await page.goto(step.value, { waitUntil: 'domcontentloaded' });
  } else if (step.type === 'click') {
    const target = locateWebElement(page, step.target);
    if (useTouch) await target.tap();
    else await target.click();
  } else if (step.type === 'fill') {
    const target = locateWebElement(page, step.target);

    await target.fill(step.value);
  } else if (step.type === 'press') {
    const target = locateWebElement(page, step.target);
    // Playwright 的 press 值支持大写
    const key = step.value.charAt(0).toUpperCase() + step.value.slice(1);

    await target.press(key);
  }
}
