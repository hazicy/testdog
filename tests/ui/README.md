# UI 测试

保留现有的 `*.e2e.ts` 命名及根目录 Playwright 配置。

- `pages/*.page.ts`：按业务页面或共享界面区域组织定位器与操作，不包含场景断言或接口 mock。
- `*.e2e.ts`：编写场景、接口响应及断言。布局计算、键盘与鼠标事件、场景专属元素可以直接使用 `page`。
- `fixtures/test.fixture.ts`：通过 Playwright Fixture 按需创建 Page Object，每个测试使用自己的 `page`。
- `fixtures/routes.ts`、`fixtures/workspace.ts`：沿用现有的接口 mock 和数据工厂。

测试从 `./fixtures/test.fixture` 导入 `test` 和 `expect`，按需声明 `loginPage`、`caseEditor`、`runPage` 等依赖。多个测试操作同一页面元素时，优先复用其 Page Object；测试数据中的特定名称和预期结果留在场景中。

```ts
import { test, expect } from './fixtures/test.fixture';

test('错误密码无法登录', async ({ loginPage }) => {
  await loginPage.goto();
  await loginPage.login('user@example.com', 'wrong-password');
  await expect(loginPage.errorAlert).toHaveText('登录失败，请检查邮箱和密码。');
});
```

运行 `pnpm test:ui` 构建 Web 应用并执行全部 UI 测试；已有最新构建时，可以运行 `pnpm exec playwright test tests/ui/auth.e2e.ts` 等定向命令。
