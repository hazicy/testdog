import type { Page } from '@playwright/test';

export class IntegrationsPage {
  constructor(private readonly page: Page) {}

  get configureFeishuButton() {
    return this.page.getByRole('button', { name: '配置飞书群机器人', exact: true });
  }

  get feishuDialog() {
    return this.page.getByRole('dialog', { name: '飞书群机器人', exact: true });
  }

  get deliveriesButton() {
    return this.page.getByRole('button', { name: '发送记录', exact: true });
  }

  get deliveriesDialog() {
    return this.page.getByRole('dialog', { name: '发送记录', exact: true });
  }

  get configureEmailButton() {
    return this.page.getByRole('button', { name: '配置Email 邮件', exact: true });
  }

  get emailDialog() {
    return this.page.getByRole('dialog', { name: 'Email 邮件', exact: true });
  }

  get configureBrowserlessButton() {
    return this.page.getByRole('button', { name: '配置Browserless', exact: true });
  }

  get browserlessDialog() {
    return this.page.getByRole('dialog', { name: 'Browserless', exact: true });
  }

  async goto() {
    await this.page.goto('/integrations');
  }

  async openDeliveries() {
    await this.deliveriesButton.click();
  }
}
