import type { Page } from '@playwright/test';

export class SettingsPage {
  constructor(private readonly page: Page) {}

  get profileTab() {
    return this.page.getByRole('tab', { name: '账户资料', exact: true });
  }

  get securityTab() {
    return this.page.getByRole('tab', { name: '登录安全' });
  }

  get generalTab() {
    return this.page.getByRole('tab', { name: '通用', exact: true });
  }

  get nameInput() {
    return this.page.getByLabel('姓名', { exact: true });
  }

  get emailInput() {
    return this.page.getByLabel('邮箱', { exact: true });
  }

  get currentPasswordInput() {
    return this.page.getByLabel('当前密码', { exact: true });
  }

  get newPasswordInput() {
    return this.page.getByLabel('新密码', { exact: true });
  }

  get confirmPasswordInput() {
    return this.page.getByLabel('确认新密码', { exact: true });
  }

  get changePasswordButton() {
    return this.page.getByRole('button', { name: '修改密码', exact: true });
  }

  get saveProfileButton() {
    return this.page.getByRole('button', { name: '保存资料' });
  }

  get errorAlert() {
    return this.page.getByRole('main').getByRole('alert');
  }

  async goto() {
    await this.page.goto('/settings');
  }

  async openProfile() {
    await this.profileTab.click();
  }

  async openSecurity() {
    await this.securityTab.click();
  }

  async saveProfile() {
    await this.saveProfileButton.click();
  }
}
