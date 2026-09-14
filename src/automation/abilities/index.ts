import type { Locator, Page } from 'playwright';
import type { Check, Step, Target } from '../compiler';
export function locate(page: Page, target: Target): Locator {
  const root = target.scope
    ? page.locator(target.scope)
    : page.locator(':root');
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
      if (
        !target.value ||
        /xpath=|^\/|nth-child|nth-of-type/.test(target.value)
      )
        throw new Error('不接受绝对路径或 DOM 序号定位');
      result = root.locator(target.value);
      break;
  }
  return target.index < 0 ? result : result.nth(target.index);
}
export async function verify(page: Page, check: Check) {
  if (
    ['.*', '^.*$', '.+', '^.+$'].includes(check.urlPattern) ||
    !check.visible.value ||
    ['body', 'html', ':root', '*'].includes(check.visible.value)
  )
    throw new Error('断言需要具体 URL 与结果元素');
  await page.waitForURL(
    (url) => matchesUrl(new RegExp(check.urlPattern), url.href),
    { timeout: 15000, waitUntil: 'domcontentloaded' },
  );
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await checkElements(page, check)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    `断言超时：${JSON.stringify(check)}；当前 URL：${page.url()}`,
  );
}
export async function checkElements(
  page: Page,
  check: Check,
): Promise<boolean> {
  const locator = locate(page, check.visible);
  const count = await locator.count();
  const mode = check.mode ?? 'unique';
  if (mode === 'unique' || mode === 'value') {
    if (count !== 1) return false;
    return (
      (await locator.isVisible()) &&
      (mode !== 'value' || (await locator.inputValue()) === check.inputValue)
    );
  }
  const minimum = mode === 'count' ? check.minCount : 1;
  if (minimum < 1) throw new Error('可见数量断言必须至少为 1');
  let visible = 0;
  for (let i = 0; i < count; i++) {
    if ((await locator.nth(i).isVisible()) && ++visible >= minimum) return true;
  }
  return false;
}
export class Abilities {
  async execute(
    page: Page,
    step: Step,
    onTransition?: (transition: Step['transition']) => void,
  ): Promise<Page> {
    if (step.type === 'navigate')
      await page.goto(step.value, { waitUntil: 'domcontentloaded' });
    else if (step.type === 'wait') {
      const milliseconds = Number(step.value);
      if (!Number.isInteger(milliseconds) || milliseconds < 100 || milliseconds > 5000)
        throw new Error('等待时间必须是 100 到 5000 毫秒之间的整数');
      await page.waitForTimeout(milliseconds);
    }
    else if (step.type !== 'assert') {
      const target = locate(page, step.target);
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
          if (popups.length > 1)
            throw new Error('动作打开多个标签页，无法唯一确定目标');
          page = popups[0] ?? source;
          const ready =
            page !== source ||
            page.url() !== beforeUrl ||
            Date.now() >= earliest + 1500;
          if (ready && Date.now() >= earliest) break;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        await page.waitForLoadState('domcontentloaded');
        const actual =
          page !== source
            ? 'popup'
            : page.url() !== beforeUrl
              ? 'navigation'
              : 'same';
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
    if (step.type === 'assert') {
      if (!step.expected) throw new Error('显式断言缺少条件');
      await verify(page, step.expected);
    }
    return page;
  }
}
function matchesUrl(pattern: RegExp, url: string) {
  if (pattern.test(url)) return true;
  try {
    return pattern.test(decodeURI(url));
  } catch {
    return false;
  }
}
