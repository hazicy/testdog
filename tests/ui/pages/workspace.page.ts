import type { Page } from '@playwright/test';

export class WorkspacePage {
  constructor(private readonly page: Page) {}

  get navigation() {
    return this.page.getByRole('navigation', { name: '工作区导航' });
  }

  get main() {
    return this.page.locator('#main-content');
  }

  get sidebar() {
    return this.page.locator('aside');
  }

  get collapseSidebarButton() {
    return this.page.getByRole('button', { name: '收起侧栏' });
  }

  get notifications() {
    return this.page.getByRole('region', { name: '通知', exact: true });
  }
}
