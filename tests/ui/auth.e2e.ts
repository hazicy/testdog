import { expect, test } from '@playwright/test';

test('registers with email and opens the workspace', async ({ page }) => {
  await page.route('**/api/auth/sign-up/email', async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({
      name: '测试用户',
      email: 'user@example.com',
      password: 'correct-password',
    });
    await route.fulfill({
      json: {
        token: 'test-token',
        user: { id: 'user-1', name: '测试用户', email: 'user@example.com' },
      },
    });
  });
  await page.route('**/api/auth/get-session', (route) => route.fulfill({ json: null }));
  await page.route('**/api/tests*', (route) =>
    route.fulfill({ json: { tests: [], nextCursor: null } }),
  );
  await page.route('**/api/workspace/stats', (route) =>
    route.fulfill({ json: { testCount: 0, runCount: 0, counts: {} } }),
  );
  await page.goto('/register');
  await page.getByLabel('姓名', { exact: true }).fill('测试用户');
  await page.getByLabel('邮箱', { exact: true }).fill('user@example.com');
  await page.getByLabel('密码', { exact: true }).fill('correct-password');
  await page.getByRole('button', { name: '注册', exact: true }).click();
  await expect(page).toHaveURL('/cases');
});

test('shows login errors and keeps a safe registration destination', async ({ page }) => {
  await page.route('**/api/auth/sign-in/email', (route) =>
    route.fulfill({
      status: 401,
      json: { code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' },
    }),
  );
  await page.goto('/login?callbackURL=%2Fruns');
  await page.getByLabel('邮箱', { exact: true }).fill('user@example.com');
  await page.getByLabel('密码', { exact: true }).fill('wrong-password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toHaveText(
    '登录失败，请检查邮箱和密码。',
  );
  await page.getByRole('link', { name: '注册', exact: true }).click();
  await expect(page).toHaveURL('/register?callbackURL=%2Fruns');
});

test('shows the current user and signs out', async ({ page }) => {
  await page.route('**/api/auth/get-session', (route) =>
    route.fulfill({
      json: {
        user: { id: 'user-1', name: '测试用户', email: 'user@example.com', emailVerified: false },
        session: { id: 'session-1', userId: 'user-1', expiresAt: '2099-01-01T00:00:00Z' },
      },
    }),
  );
  await page.route('**/api/auth/sign-out', (route) => route.fulfill({ json: { success: true } }));
  await page.route('**/api/tests*', (route) =>
    route.fulfill({ json: { tests: [], nextCursor: null } }),
  );
  await page.route('**/api/workspace/stats', (route) =>
    route.fulfill({ json: { testCount: 0, runCount: 0, counts: {} } }),
  );
  await page.goto('/cases');
  await expect(page.getByText('测试用户', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '退出', exact: true }).click();
  await expect(page).toHaveURL('/login');
});

test('clears cached case data when signing out and entering another account', async ({ page }) => {
  let account: 'alice' | 'bob' | null = 'alice';
  const session = () =>
    account
      ? {
          user: {
            id: account,
            name: account,
            email: account + '@example.com',
            emailVerified: false,
          },
          session: { id: 'session-' + account, userId: account, expiresAt: '2099-01-01T00:00:00Z' },
        }
      : null;

  await page.route('**/api/auth/get-session', (route) => route.fulfill({ json: session() }));
  await page.route('**/api/auth/sign-out', (route) => {
    account = null;

    return route.fulfill({ json: { success: true } });
  });
  await page.route('**/api/auth/sign-in/email', (route) => {
    account = 'bob';

    return route.fulfill({ json: { token: 'bob-token', user: session()!.user } });
  });
  await page.route('**/api/tests*', (route) =>
    route.fulfill({
      json: {
        tests: account
          ? [
              {
                id:
                  account === 'alice'
                    ? '62534c46-a8eb-4991-993e-af6df14bece0'
                    : '62534c46-a8eb-4991-993e-af6df14bece1',
                name: account === 'alice' ? 'Alice secret case' : 'Bob private case',
                goal: 'Private goal',
                url: 'https://example.com',
                tags: [],
                createdAt: '2026-10-10T00:00:00Z',
                updatedAt: '2026-10-10T00:00:00Z',
              },
            ]
          : [],
        latestRuns: [],
        nextCursor: null,
      },
    }),
  );
  await page.route('**/api/workspace/stats', (route) =>
    route.fulfill({ json: { testCount: 1, runCount: 0, counts: {} } }),
  );
  await page.goto('/cases');
  await expect(page.getByText('Alice secret case', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '退出', exact: true }).click();
  await expect(page).toHaveURL('/login');
  await page.getByLabel('邮箱', { exact: true }).fill('bob@example.com');
  await page.getByLabel('密码', { exact: true }).fill('correct-password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page).toHaveURL('/cases');
  await expect(page.getByText('Bob private case', { exact: true })).toBeVisible();
  await expect(page.getByText('Alice secret case', { exact: true })).toHaveCount(0);
});
