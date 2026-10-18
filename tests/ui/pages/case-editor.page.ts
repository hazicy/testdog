import type { Page } from '@playwright/test';

export class CaseEditorPage {
  constructor(private readonly page: Page) {}

  get newTestButton() {
    return this.page.getByRole('button', { name: '新建测试', exact: true });
  }

  get quickCreateButton() {
    return this.page.getByRole('button', { name: '快速创建', exact: true });
  }

  get canvas() {
    return this.page.locator('[data-ui~="case-canvas-page"]');
  }

  get board() {
    return this.page.getByRole('region', { name: '测试画板' });
  }

  get promptInput() {
    return this.page.getByLabel('测试步骤与预期结果');
  }

  get generateButton() {
    return this.page.getByRole('button', { name: '生成', exact: true });
  }

  get acceptAllButton() {
    return this.page.getByRole('button', { name: '全部接受', exact: true });
  }

  get saveButton() {
    return this.page.getByRole('button', { name: '保存', exact: true });
  }

  get resetZoomButton() {
    return this.page.getByRole('button', { name: '画板恢复原始比例' });
  }

  get describeButton() {
    return this.page.getByRole('button', { name: '描述生成', exact: true });
  }

  get allCasesButton() {
    return this.page.getByRole('button', { name: '全部用例', exact: true });
  }

  async goto() {
    await this.page.goto('/cases');
  }

  async create() {
    await this.newTestButton.click();
  }
}
