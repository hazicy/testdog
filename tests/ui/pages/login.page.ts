import type { Page } from '@playwright/test';

export class LoginPage {
  constructor(private readonly page: Page) {}

  get emailInput() {
    return this.page.getByLabel('邮箱', { exact: true });
  }

  get passwordInput() {
    return this.page.getByLabel('密码', { exact: true });
  }

  get loginButton() {
    return this.page.getByRole('button', { name: '登录', exact: true });
  }

  get errorAlert() {
    return this.page.getByRole('main').getByRole('alert');
  }

  get registerLink() {
    return this.page.getByRole('link', { name: '注册', exact: true });
  }

  async goto(callbackURL?: string) {
    const query = callbackURL ? `?callbackURL=${encodeURIComponent(callbackURL)}` : '';

    await this.page.goto(`/login${query}`);
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  }
}
