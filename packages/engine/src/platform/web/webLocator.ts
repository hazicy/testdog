import type { Locator, Page } from 'playwright';
import type { Target } from '@testdog/contracts/execution/plan';

export function locateWebElement(page: Page, target: Target): Locator {
  const root = target.scope ? locateWebElement(page, target.scope) : page.locator(':root');
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
    case 'text':
      result = root.getByText(target.value, { exact: true });
      break;
    case 'testId':
      result = root.getByTestId(target.value);
      break;
    case 'css':
      if (!target.value || /xpath=|^\/|nth-child|nth-of-type/.test(target.value))
        throw new Error('不接受绝对路径或 DOM 序号定位');
      result = root.locator(target.value);
      break;
    case 'ariaRef':
      result = page.locator(`aria-ref=${target.value}`);
      // The aria-ref engine ignores its query root; intersect with the region descendants.
      if (target.scope) result = result.and(root.locator('*'));
      break;
  }

  return target.index === undefined ? result : result.nth(target.index);
}
