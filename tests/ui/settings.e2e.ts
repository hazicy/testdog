import { test, expect } from './fixtures/test.fixture';

async function mockAccount(page: import('@playwright/test').Page, provider = 'credential') {
  let name = '测试用户';

  await page.route('**/api/auth/get-session', (route) =>
    route.fulfill({
      json: {
        user: { id: 'user-1', name, email: 'user@example.com', emailVerified: false },
        session: { id: 'session-1', userId: 'user-1', expiresAt: '2099-01-01T00:00:00Z' },
      },
    }),
  );
  await page.route('**/api/auth/list-accounts', (route) =>
    route.fulfill({ json: [{ providerId: provider }] }),
  );
  await page.route('**/api/auth/update-user', (route) => {
    name = route.request().postDataJSON().name;

    return route.fulfill({ json: { status: true } });
  });
}

test('profile and security settings remain usable on a narrow phone', async ({
  page,
  workspacePage,
  settingsPage,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await mockAccount(page);
  await settingsPage.goto();
  await settingsPage.openProfile();
  await expect(settingsPage.nameInput).toBeVisible();
  await settingsPage.openSecurity();
  await expect(settingsPage.currentPasswordInput).toBeVisible();
  expect(
    await workspacePage.main.evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  await settingsPage.changePasswordButton.scrollIntoViewIfNeeded();
  await expect(settingsPage.changePasswordButton).toBeInViewport();
});

test('saves the profile and updates the sidebar and refreshed page', async ({
  page,
  settingsPage,
  workspacePage,
}) => {
  await mockAccount(page);
  await settingsPage.goto();
  await settingsPage.openProfile();
  await expect(settingsPage.emailInput).toHaveValue('user@example.com');
  await expect(settingsPage.emailInput).toHaveAttribute('readonly', '');
  await settingsPage.nameInput.fill('更新用户');
  await settingsPage.saveProfile();
  await expect(
    workspacePage.notifications.getByText('资料已保存。', { exact: true }).last(),
  ).toBeVisible();
  await expect(workspacePage.sidebar.getByText('更新用户', { exact: true })).toBeVisible();
  await page.reload();
  await settingsPage.openProfile();
  await expect(settingsPage.nameInput).toHaveValue('更新用户');
});

test('validates confirmation, handles incorrect passwords and clears fields on success', async ({
  page,
  workspacePage,
  settingsPage,
}) => {
  await mockAccount(page);
  let requests = 0;

  await page.route('**/api/auth/change-password', (route) => {
    requests++;
    expect(route.request().postDataJSON()).toMatchObject({
      currentPassword: 'old-password',
      newPassword: 'new-password',
      revokeOtherSessions: true,
    });

    return requests === 1
      ? route.fulfill({
          status: 400,
          json: { code: 'INVALID_PASSWORD', message: 'Invalid password' },
        })
      : route.fulfill({ json: { token: 'new-token', user: { id: 'user-1' } } });
  });
  await settingsPage.goto();
  await settingsPage.openProfile();
  await settingsPage.openSecurity();
  await settingsPage.currentPasswordInput.fill('old-password');
  await settingsPage.newPasswordInput.fill('new-password');
  await settingsPage.confirmPasswordInput.fill('different-password');
  await settingsPage.changePasswordButton.click();
  await expect(settingsPage.errorAlert).toHaveText('两次输入的新密码不一致。');
  expect(requests).toBe(0);
  await settingsPage.confirmPasswordInput.fill('new-password');
  await settingsPage.changePasswordButton.click();
  await expect(settingsPage.errorAlert).toHaveText('当前密码不正确，请重新输入。');
  await settingsPage.changePasswordButton.click();
  await expect(
    workspacePage.notifications
      .getByText('密码已修改，其他设备的登录已退出。', { exact: true })
      .last(),
  ).toBeVisible();
  await expect(settingsPage.currentPasswordInput).toHaveValue('');
  await expect(settingsPage.newPasswordInput).toHaveValue('');
  await expect(settingsPage.confirmPasswordInput).toHaveValue('');
});

test('guides third-party accounts to their login provider', async ({ page, settingsPage }) => {
  await mockAccount(page, 'github');
  await settingsPage.goto();
  await settingsPage.openProfile();
  await settingsPage.openSecurity();
  await expect(page.getByText('此账户使用第三方登录', { exact: false })).toBeVisible();
  await expect(settingsPage.changePasswordButton).toHaveCount(0);
});

test('keeps profile edits when saving fails and supports retry', async ({
  page,
  workspacePage,
  settingsPage,
}) => {
  await mockAccount(page);
  let requests = 0;

  await page.route('**/api/auth/update-user', (route) => {
    requests++;

    return requests === 1
      ? route.fulfill({ status: 500, json: { message: 'Failed' } })
      : route.fulfill({ json: { status: true } });
  });
  await settingsPage.goto();
  await settingsPage.openProfile();
  await settingsPage.nameInput.fill('保留草稿');
  await settingsPage.saveProfile();
  await expect(settingsPage.errorAlert).toHaveText('资料保存失败，请稍后重试。');
  await expect(settingsPage.nameInput).toHaveValue('保留草稿');
  await settingsPage.saveProfile();
  await expect(
    workspacePage.notifications.getByText('资料已保存。', { exact: true }).last(),
  ).toBeVisible();
});
