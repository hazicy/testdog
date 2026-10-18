import type { Page } from '@playwright/test';

export class AccountMenu {
  constructor(private readonly page: Page) {}

  get button() {
    return this.page.getByRole('button', { name: '账户菜单', exact: true });
  }

  get menu() {
    return this.page.getByRole('menu', { name: '账户菜单' });
  }

  get signOutItem() {
    return this.page.getByRole('menuitem', { name: '退出', exact: true });
  }

  async open() {
    await this.button.click();
  }

  async signOut() {
    await this.signOutItem.click();
  }
}
