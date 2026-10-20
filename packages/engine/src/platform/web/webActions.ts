import type { Page } from 'playwright';
import type { Step } from '@testdog/contracts/execution/plan';
import { locateWebElement } from '@testdog/engine/platform/web/webLocator';
import { captureWebScreenshot } from '@testdog/engine/platform/web/screenshot';
import { ReplanRequiredError } from '@testdog/engine/replanning';

export async function executeWebAction(
  page: Page,
  step: Exclude<Step, { type: 'wait' }>,
  useTouch = false,
): Promise<void> {
  if (step.type === 'screenshot') {
    await captureWebScreenshot(page, { timeout: 15000 });
    // The session recorder archives the corresponding before/after image.

    return;
  }

  if (step.type === 'navigate') {
    await page.goto(step.value, { waitUntil: 'domcontentloaded' });

    return;
  }

  const target = locateWebElement(page, step.target);

  if (step.target.scope) {
    const scope = locateWebElement(page, step.target.scope);

    if ((await scope.count()) !== 1)
      throw new ReplanRequiredError('区域已不存在或无法唯一定位，请根据最新观察重新选择区域');
    const matches = await target.count();

    if (matches !== 1)
      throw new ReplanRequiredError(
        `区域内定位匹配到 ${matches} 个元素，请展开区域观察后重新选择目标`,
      );
  }

  if (step.type === 'click') {
    try {
      if (useTouch) await target.tap();
      else await target.click();
    } catch (error) {
      if (
        error instanceof Error &&
        error.name === 'TimeoutError' &&
        error.message.includes('intercepts pointer events') &&
        !/performing (?:click|tap) action|(?:click|tap) action done|waiting for scheduled navigations/.test(
          error.message,
        )
      )
        throw new ReplanRequiredError(
          '目标被其他元素遮挡，点击尚未发送，请根据最新观察重新选择目标',
          { cause: error },
        );
      throw error;
    }
  } else if (step.type === 'fill') {
    await target.fill(step.value);
  } else if (step.type === 'press') {
    // Playwright 的 press 值支持大写
    const key = step.value.charAt(0).toUpperCase() + step.value.slice(1);

    await target.press(key);
  }
}
