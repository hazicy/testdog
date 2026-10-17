import { expect, test } from '@playwright/test';

const teamId = '36e2d100-8669-4e42-9884-fc2af0a00111';
const member = { userId: 'alice', name: 'Alice', email: 'alice@example.com', role: 'admin' };

test('creates a team, invites members and switches back to a clean personal workspace', async ({
  page,
}) => {
  let activeTeamId: string | null = null;
  let created = false;

  await page.route('**/api/auth/get-session', (route) =>
    route.fulfill({
      json: {
        user: { id: 'alice', name: 'Alice', email: member.email, emailVerified: true },
        session: { id: 'session', userId: 'alice', expiresAt: '2099-01-01T00:00:00Z' },
      },
    }),
  );
  await page.route('**/api/auth/list-accounts', (route) =>
    route.fulfill({ json: [{ providerId: 'credential' }] }),
  );
  await page.route('**/api/teams', async (route) => {
    if (route.request().method() === 'POST') {
      const input = route.request().postDataJSON();

      if (input.action === 'create') {
        expect(input.name).toBe('QA Team');
        created = true;
        activeTeamId = teamId;

        return route.fulfill({ json: { activeTeamId } });
      }

      if (input.action === 'invite') {
        expect(input).toMatchObject({ teamId, email: 'bob@example.com' });

        return route.fulfill({ json: { invitationToken: 'a'.repeat(64) } });
      }

      expect(input).toEqual({ action: 'switch', teamId: null });
      activeTeamId = null;

      return route.fulfill({ json: { activeTeamId } });
    }

    return route.fulfill({
      json: {
        teams: created ? [{ id: teamId, name: 'QA Team', role: 'admin' }] : [],
        activeTeamId,
        members: activeTeamId ? [member] : [],
        invitations: [],
      },
    });
  });
  await page.route('**/api/tests*', (route) =>
    route.fulfill({ json: { tests: [], nextCursor: null, latestRuns: [] } }),
  );
  await page.route('**/api/workspace/stats', (route) =>
    route.fulfill({ json: { testCount: 0, runCount: 0, counts: {} } }),
  );
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/settings?team=1');
  await page.getByLabel('团队名称', { exact: true }).fill('QA Team');
  await page.getByRole('button', { name: '创建团队', exact: true }).click();
  await expect(page.getByLabel('切换工作区')).toHaveText('QA Team');
  await expect(
    page.locator('#main-content').getByText(member.email, { exact: true }),
  ).toBeVisible();
  await page.getByLabel('成员邮箱').fill('bob@example.com');
  await page.getByRole('button', { name: '创建邀请', exact: true }).click();
  await expect(page.getByLabel('邀请链接', { exact: false })).toHaveValue(
    new RegExp('/settings\\?invite=' + 'a'.repeat(64)),
  );
  expect(
    await page
      .locator('#main-content')
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  await page.getByLabel('切换工作区').click();
  await page.getByRole('option', { name: '个人空间', exact: true }).click();
  await expect(page).toHaveURL('/cases');
  await expect(page.getByLabel('切换工作区')).toHaveText('个人空间');
});

test('refreshes other tabs when switching workspaces', async ({ page, context }) => {
  let activeTeamId: string | null = teamId;

  await context.route('**/api/auth/get-session', (route) =>
    route.fulfill({
      json: {
        user: { id: 'alice', name: 'Alice', email: member.email, emailVerified: true },
        session: { id: 'session', userId: 'alice', expiresAt: '2099-01-01T00:00:00Z' },
      },
    }),
  );
  await context.route('**/api/teams', (route) => {
    if (route.request().method() === 'POST') activeTeamId = route.request().postDataJSON().teamId;

    return route.fulfill({
      json: {
        teams: [{ id: teamId, name: 'QA Team', role: 'admin' }],
        activeTeamId,
        members: [member],
        invitations: [],
      },
    });
  });
  await context.route('**/api/tests*', (route) =>
    route.fulfill({ json: { tests: [], latestRuns: [], nextCursor: null } }),
  );
  await context.route('**/api/workspace/stats', (route) =>
    route.fulfill({ json: { testCount: 0, runCount: 0, counts: {} } }),
  );
  await page.goto('/cases');
  const other = await context.newPage();

  await other.goto('/cases');
  await expect(other.getByLabel('切换工作区')).toHaveText('QA Team');
  await page.getByLabel('切换工作区').click();
  const refreshed = other.waitForEvent('domcontentloaded');

  await page.getByRole('option', { name: '个人空间', exact: true }).click();
  await refreshed;
  await expect(other.getByLabel('切换工作区')).toHaveText('个人空间');
});
