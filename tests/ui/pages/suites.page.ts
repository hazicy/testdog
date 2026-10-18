import type { Page } from '@playwright/test';

export class SuitesPage {
  constructor(private readonly page: Page) {}

  get createButton() {
    return this.page.getByRole('button', { name: '新建', exact: true });
  }

  get content() {
    return this.page.locator('[data-ui="suite-content"]');
  }

  get folderSelect() {
    return this.page.getByRole('combobox', { name: '所属文件夹' });
  }

  get moveButton() {
    return this.page.getByRole('button', { name: '移动', exact: true });
  }

  get stopBatchButton() {
    return this.page.getByRole('button', { name: '停止整批执行', exact: true });
  }

  get collapseButton() {
    return this.page.getByRole('button', { name: '收起用例目录', exact: true });
  }

  get expandButton() {
    return this.page.getByRole('button', { name: '展开用例目录', exact: true });
  }
}
