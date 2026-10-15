import { expect, test } from '@playwright/test';

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

test('profile and security settings remain usable on a narrow phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await mockAccount(page);
  await page.goto('/settings');
  await page.getByRole('tab', { name: '账户资料', exact: true }).click();
  await expect(page.getByLabel('姓名', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: '登录安全' }).click();
  await expect(page.getByLabel('当前密码', { exact: true })).toBeVisible();
  expect(
    await page
      .locator('#main-content')
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  await page.getByRole('button', { name: '修改密码', exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: '修改密码', exact: true })).toBeInViewport();
});

test('saves the profile and updates the sidebar and refreshed page', async ({ page }) => {
  await mockAccount(page);
  await page.goto('/settings');
  await page.getByRole('tab', { name: '账户资料', exact: true }).click();
  await expect(page.getByLabel('邮箱', { exact: true })).toHaveValue('user@example.com');
  await expect(page.getByLabel('邮箱', { exact: true })).toHaveAttribute('readonly', '');
  await page.getByLabel('姓名', { exact: true }).fill('更新用户');
  await page.getByRole('button', { name: '保存资料' }).click();
  await expect(page.getByRole('status')).toHaveText('资料已保存。');
  await expect(page.locator('aside').getByText('更新用户', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('tab', { name: '账户资料', exact: true }).click();
  await expect(page.getByLabel('姓名', { exact: true })).toHaveValue('更新用户');
});

test('validates confirmation, handles incorrect passwords and clears fields on success', async ({
  page,
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
  await page.goto('/settings');
  await page.getByRole('tab', { name: '账户资料', exact: true }).click();
  await page.getByRole('tab', { name: '登录安全' }).click();
  await page.getByLabel('当前密码', { exact: true }).fill('old-password');
  await page.getByLabel('新密码', { exact: true }).fill('new-password');
  await page.getByLabel('确认新密码', { exact: true }).fill('different-password');
  await page.getByRole('button', { name: '修改密码', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toHaveText('两次输入的新密码不一致。');
  expect(requests).toBe(0);
  await page.getByLabel('确认新密码', { exact: true }).fill('new-password');
  await page.getByRole('button', { name: '修改密码', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toHaveText(
    '当前密码不正确，请重新输入。',
  );
  await page.getByRole('button', { name: '修改密码', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('密码已修改，其他设备的登录已退出。');
  await expect(page.getByLabel('当前密码', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('新密码', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('确认新密码', { exact: true })).toHaveValue('');
});

test('guides third-party accounts to their login provider', async ({ page }) => {
  await mockAccount(page, 'github');
  await page.goto('/settings');
  await page.getByRole('tab', { name: '账户资料', exact: true }).click();
  await page.getByRole('tab', { name: '登录安全' }).click();
  await expect(page.getByText('此账户使用第三方登录', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: '修改密码', exact: true })).toHaveCount(0);
});

test('keeps profile edits when saving fails and supports retry', async ({ page }) => {
  await mockAccount(page);
  let requests = 0;

  await page.route('**/api/auth/update-user', (route) => {
    requests++;

    return requests === 1
      ? route.fulfill({ status: 500, json: { message: 'Failed' } })
      : route.fulfill({ json: { status: true } });
  });
  await page.goto('/settings');
  await page.getByRole('tab', { name: '账户资料', exact: true }).click();
  await page.getByLabel('姓名', { exact: true }).fill('保留草稿');
  await page.getByRole('button', { name: '保存资料' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toHaveText('资料保存失败，请稍后重试。');
  await expect(page.getByLabel('姓名', { exact: true })).toHaveValue('保留草稿');
  await page.getByRole('button', { name: '保存资料' }).click();
  await expect(page.getByRole('status')).toHaveText('资料已保存。');
});
