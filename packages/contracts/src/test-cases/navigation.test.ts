import { expect, it } from 'vitest';
import { testSchema } from '@testdog/contracts/test-cases/schemas';

function navigationCase(url: string) {
  return {
    name: '页面测试',
    goal: '打开页面',
    target: { platform: 'web' },
    plan: {
      rootId: 'open',
      nodes: {
        open: {
          id: 'open',
          kind: 'task',
          actionType: 'navigate',
          goal: url,
          dependsOn: [],
          requirementIds: [],
          assertions: [],
        },
      },
    },
  };
}

it('saves Web cases with navigation in the plan and no URL in settings', () => {
  const saved = testSchema.parse(navigationCase('https://example.com'));

  expect(saved.plan?.nodes.open).toMatchObject({
    actionType: 'navigate',
    goal: 'https://example.com',
  });
});

it.each(['https://', 'example.com', 'file:///etc/passwd', 'javascript:alert(1)'])(
  'rejects an invalid Navigate URL: %s',
  (url) => {
    const result = testSchema.safeParse(navigationCase(url));

    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({ message: '请在 Navigate 步骤中填写有效的 http 或 https 地址' }),
      );
  },
);
