import type { Locator, Page } from 'playwright';
import type { Step, Target } from './compiler';

export class Abilities {
  constructor() {}

  async execute(
    page: Page,
    step: Step,
    onTransition?: (transition: Step['transition']) => void,
  ): Promise<Page> {
    if (step.type === 'navigate') await page.goto(step.value, { waitUntil: 'domcontentloaded' });
    else if (step.type === 'wait') {
      const milliseconds = Number(step.value);
      if (!Number.isInteger(milliseconds) || milliseconds < 100 || milliseconds > 5000)
        throw new Error('等待时间必须是 100 到 5000 毫秒之间的整数');
      await page.waitForTimeout(milliseconds);
    } else if (step.type !== 'assert') {
      const target = this.locate(page, step.target);
      await target.waitFor({ state: 'visible' });
      const source = page;
      const beforeUrl = page.url();
      const popups: Page[] = [];
      const collect = (opened: Page) => {
        popups.push(opened);
      };
      source.on('popup', collect);
      try {
        if (step.type === 'click') await target.click();
        if (step.type === 'fill') {
          await target.fill(step.value);
        }
        if (step.type === 'press') await target.press(step.value);
        const deadline = Date.now() + 15000;
        const earliest = Date.now() + 500;
        while (Date.now() < deadline) {
          if (popups.length > 1) throw new Error('动作打开多个标签页，无法唯一确定目标');
          page = popups[0] ?? source;
          const ready =
            page !== source || page.url() !== beforeUrl || Date.now() >= earliest + 1500;
          if (ready && Date.now() >= earliest) break;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        await page.waitForLoadState('domcontentloaded');
        const actual = page !== source ? 'popup' : page.url() !== beforeUrl ? 'navigation' : 'same';
        onTransition?.(actual);
        console.info('动作后页面', {
          predicted: step.transition,
          actual,
          url: page.url(),
        });
        return page;
      } finally {
        source.off('popup', collect);
      }
    }
    return page;
  }

  locate(page: Page, target: Target): Locator {
    const root = target?.scope ? page.locator(target?.scope) : page.locator(':root');
    let result: Locator;
    switch (target.kind) {
      case 'role':
        result = root.getByRole(
          target.value as Parameters<Page['getByRole']>[0],
          target.name ? { name: target.name, exact: true } : {},
        );
        break;
      case 'label':
        result = root.getByLabel(target.value, { exact: true });
        break;
      case 'placeholder':
        result = root.getByPlaceholder(target.value, { exact: true });
        break;
      case 'testId':
        result = root.getByTestId(target.value);
        break;
      case 'css':
        if (!target.value || /xpath=|^\/|nth-child|nth-of-type/.test(target.value))
          throw new Error('不接受绝对路径或 DOM 序号定位');
        result = root.locator(target.value);
        break;
    }
    return target.index < 0 ? result : result.nth(target.index);
  }
}
