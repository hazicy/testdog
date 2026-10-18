import type { Page } from '@playwright/test';

export class TeamsPage {
  constructor(private readonly page: Page) {}

  get workspaceSelect() {
    return this.page.getByLabel('切换工作区');
  }

  get personalWorkspaceOption() {
    return this.page.getByRole('option', { name: '个人空间', exact: true });
  }

  get teamNameInput() {
    return this.page.getByLabel('团队名称', { exact: true });
  }

  get createButton() {
    return this.page.getByRole('button', { name: '创建团队', exact: true });
  }

  get memberEmailInput() {
    return this.page.getByLabel('成员邮箱');
  }

  get inviteButton() {
    return this.page.getByRole('button', { name: '创建邀请', exact: true });
  }

  async goto() {
    await this.page.goto('/settings?team=1');
  }
}
