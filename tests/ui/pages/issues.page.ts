import type { Page } from '@playwright/test';

export class IssuesPage {
  constructor(private readonly page: Page) {}

  get createButton() {
    return this.page.getByRole('button', { name: '新建问题' });
  }

  get titleInput() {
    return this.page.getByLabel('问题标题', { exact: true });
  }

  get saveButton() {
    return this.page.getByRole('button', { name: '保存问题', exact: true });
  }

  async openEditor() {
    await this.page.getByRole('button', { name: '问题操作', exact: true }).click();
    await this.page.getByRole('menuitem', { name: '编辑问题', exact: true }).click();
  }

  get statusSelect() {
    return this.page.getByRole('combobox', { name: '问题状态' });
  }

  get linkedIssues() {
    return this.page.getByRole('region', { name: '关联问题', exact: true });
  }

  get issuesButton() {
    return this.page.getByRole('button', { name: '关联问题', exact: true });
  }

  async goto() {
    await this.page.goto('/issues');
  }
}
