# CaseForge

基于 Next.js、Playwright 和 DeepSeek 的自动化测试工作台。当前页面为基础框架，核心能力通过 API 提供：自然语言用例编译、浏览器操作、条件分支和结果断言。

## 本地运行

使用 Node.js 22+ 和 pnpm。

```bash
pnpm install
cp .env.example .env
# 编辑 .env，填写模型密钥和数据库地址
# 可选：启动本地 PostgreSQL
docker compose up -d
pnpm db:migrate
pnpm exec playwright install chromium
pnpm dev
```

打开 http://localhost:3000。默认以有界面模式运行 Chromium；服务器环境设置 `AUTOMATION_HEADLESS=true`。

## 目录

```text
src/
  app/                 页面、布局与 API 路由
  components/          共享界面组件
  automation/          模型适配、动作规划、页面观察与自动化执行
    compiler/          文本用例编译、计划与动作的 schema / 类型
  db/                  数据库连接、表定义与查询
drizzle/              数据库迁移
```

测试与被测模块放在一起。新增功能按实际职责归入上述目录，避免为占位组件或单个适配器增加中间层。

## API

- `GET /api`：健康检查。
- `GET /api/cases`：读取用例。
- `POST /api/cases`：写入 `{ "id": 1, "goal": "测试目标" }`。
- `POST /api/runs`：执行 `{ "case": "测试步骤与预期结果", "url": "https://example.com", "mode": "record" }`。`url` 可省略，`mode` 默认 `record`；`replay` 尚未实现。

执行链路：TextCompiler → Executor → Planner / Observer → Playwright。计划支持分组、依赖与条件分支；断言只读取当前页面证据，不执行补救操作。

每个用例共用一个 `BrowserSession`，自动跟随新标签页，并在当前标签页关闭后回到仍打开的页面。页面切换或导航后重新观察，再使用新的定位引用。Planner 可等待新标签页、URL 片段或可见文本，也可暂停后重新观察；每个任务最多执行 20 次操作，另有 15 秒等待预算，按每次申请的等待时长扣减。页面持续更新或存在后台请求不会阻止观察，是否完成仍由当前页面证据决定。

## 验证与构建

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm format:check
pnpm build
```

默认测试不请求真实模型。需要模型服务的编译器集成测试单独运行：

```bash
RUN_LIVE_TESTS=true pnpm exec vitest run src/automation/compiler/textCompiler.integration.test.ts
```

修改数据库表定义后运行 `pnpm db:generate` 生成迁移，再运行 `pnpm db:migrate` 应用。
