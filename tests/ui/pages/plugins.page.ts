import type { Page } from '@playwright/test';

export class PluginsPage {
  constructor(private readonly page: Page) {}

  get abTestButton() {
    return this.page.getByRole('button', { name: /火山引擎 A\/B 测试/ });
  }

  get urlIncludesInput() {
    return this.page.getByRole('textbox', { name: '接口地址包含', exact: true });
  }

  get groupNameInput() {
    return this.page.getByRole('textbox', { name: '组名', exact: true });
  }

  get experimentValueInput() {
    return this.page.getByRole('textbox', { name: '实验值（JSON）', exact: true });
  }

  async goto() {
    await this.page.goto('/plugins');
  }
}
