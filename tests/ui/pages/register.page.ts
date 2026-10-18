import type { Page } from '@playwright/test';

export class RegisterPage {
  constructor(private readonly page: Page) {}

  get nameInput() {
    return this.page.getByLabel('姓名', { exact: true });
  }

  get emailInput() {
    return this.page.getByLabel('邮箱', { exact: true });
  }

  get passwordInput() {
    return this.page.getByLabel('密码', { exact: true });
  }

  get registerButton() {
    return this.page.getByRole('button', { name: '注册', exact: true });
  }

  async goto() {
    await this.page.goto('/register');
  }

  async register(name: string, email: string, password: string) {
    await this.nameInput.fill(name);
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.registerButton.click();
  }
}
