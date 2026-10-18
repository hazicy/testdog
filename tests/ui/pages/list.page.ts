import type { Page } from '@playwright/test';

export class ListPage {
  constructor(private readonly page: Page) {}

  get table() {
    return this.page.getByRole('table');
  }

  get footer() {
    return this.page.locator('[data-ui="workspace-index-footer"]');
  }

  get previousButton() {
    return this.page.getByRole('button', { name: '上一页', exact: true });
  }

  get nextButton() {
    return this.page.getByRole('button', { name: '下一页', exact: true });
  }

  searchInput(name: string) {
    return this.page.getByRole('textbox', { name, exact: true });
  }

  statusFilter(issues: boolean) {
    return this.page.getByLabel(issues ? '筛选问题状态' : '状态筛选', { exact: true });
  }
}
