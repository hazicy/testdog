# CaseForge

基于 Next.js、PostgreSQL、Playwright 和 DeepSeek 的自然语言测试工作台。编写用例、录制执行、观察浏览器画面、查看逐步证据，并按记录重放操作。

## 本地运行

使用 Node.js 22.13+ 和 pnpm 12.10.1。CI 使用 Node.js 24；仓库通过 `packageManager` 固定 pnpm 版本。

```bash
pnpm install
cp .env.example .env
# 配置 DATABASE_URL 和 OPENAI_API_KEY
# 使用现有开发数据库，或启动本地 PostgreSQL：
docker compose up -d
pnpm db:migrate
pnpm exec playwright install chromium
pnpm dev
```

打开 http://localhost:3000，进入工作台：

- `/cases`（Tests）：创建、编辑、复制与删除用例，搜索名称、地址和标签，按最近执行状态筛选，发起录制。
- `/runs`（Results）：查看历史执行、状态和耗时。
- `/runs/:id`（Execution Studio）：观察持续更新的浏览器画面，查看每个步骤的前后截图、稳定定位器、断言证据和错误；拖动时间轴回看，播放完整录像，下载录像、Playwright Trace 或 JSON 报告；在计划画板中查看分组、分支和依赖，在 CodeMirror 中编辑录制操作与预期，保存版本后重放。

工作台使用 PostgreSQL 存储用例、执行快照、步骤和附件元数据。图片、视频和 Trace 存在 `.automation/artifacts`；可设置 `CASEFORGE_DATA_DIR` 指定附件数据目录。旧版本的 `.automation/workspace.json` 不再作为工作台数据源，原文件不会被删除。

每次执行保存用例快照。编辑或删除用例不会改变历史结果；删除用例后，历史记录仍可回看和重放。录制中的页面每秒采样画面，界面每 1.5 秒读取最新执行详情，按钮操作前后另外保存截图。视频和 Trace 在执行结束时完成归档。运行中可以停止执行。

“画面回看”播放保存的画面或录像；“重放操作”创建新的执行，使用记录中的稳定定位器、输入值和页面编号执行原动作顺序，重新验证原断言与条件分支，不调用模型重新规划动作。自然语言断言和分支验证仍需要模型；编辑器也支持直接执行原生 Playwright 断言。原始录制要求成功且每步均可稳定定位；失败录制可修正为独立版本后重放。编辑版本与执行快照保存在数据库，原始录制保持完整。重放可再次影响被测应用。

默认有界面运行 Chromium；服务器环境设置 `AUTOMATION_HEADLESS=true`。模型适配器使用 `OPENAI_API_KEY`，连接 DeepSeek。数据库和画面附件需要持久存储。

附件接口使用流式读取，录像拖动时仅读取浏览器请求的字节范围，避免将完整录像或 Trace 加载到服务端内存。支持 `HEAD` 查询文件大小；附件路径及其符号链接目标必须位于配置的附件目录内。

## 数据库与 API

结构、状态和接口示例见 [工作台接口文档](docs/workspace.md)。迁移仅新增工作台表和约束，保留原有 `case` 与 `users` 表。

运行器使用常驻 Node 服务，通过 PostgreSQL 事务锁限制同时执行一条测试。每 5 秒更新租约；60 秒未续约的执行标记为中断。每次执行最多 5 分钟，超时关闭浏览器并保存失败结果。当前部署适用于有本地持久磁盘的 Node 服务器；不适用于会冻结后台任务或没有持久磁盘的短生命周期函数。

## 目录

```text
src/
  app/                 页面、布局与 API 路由
  components/          营销页、工作台与执行工作室
    marketing/         首页演示与动效
    shell/             工作区导航与布局
    workspace/         用例和结果列表、用例编辑与删除弹窗
    studio/            执行详情、画板、录制与代码编辑器
    shared/            图标与原生模态框
  client/              浏览器端 JSON 请求、串行刷新与轮询生命周期
  automation/          编译、规划、页面观察、浏览器会话与执行
    compiler/          用例计划和动作 schema
  workspace/           数据库仓库、步骤记录、画面附件与运行生命周期
  db/                  Drizzle 表定义与 PostgreSQL 连接
drizzle/              数据库迁移
docs/                 数据模型和 API 文档
```

## 验证

提交前运行统一检查；遇到失败会立即停止后续步骤：

```bash
pnpm check
```

该命令依次检查格式、Lint、类型、默认测试，再构建生产版本并执行 UI 测试。`.github/workflows/quality.yml` 在 push 和 pull request 时执行相同检查，使用锁文件安装依赖和真实 Chromium。CI 不连接实际数据库或调用真实模型。浏览器组件的 Lint 规则禁止直接导入数据库、仓库和运行器模块。

也可以单独运行：

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm format:check
pnpm build
pnpm test:ui
```

`pnpm test:ui` 构建并启动本地生产服务器，用 Chromium 验证工作台增删改、复制、失败重试、编辑器延迟加载和草稿保留。UI 测试模拟 API，不访问实际数据库或模型；需要本机 3100 端口可用。

默认测试使用隔离的 PostgreSQL WASM 引擎和真实 Chromium，不连接 `.env` 的远程数据库，不调用真实模型。真实模型录制与重放验证使用本地示例网站和隔离数据库，可单独运行：

```bash
RUN_WORKSPACE_LIVE_TESTS=true pnpm exec vitest run src/workspace/liveRun.integration.test.ts
```

只验证用例编译的原有集成测试：

```bash
RUN_LIVE_TESTS=true pnpm exec vitest run src/automation/compiler/textCompiler.integration.test.ts
```

下载 Trace 后，可以通过 `pnpm exec playwright show-trace <trace.zip>` 查看页面快照和浏览器动作。

修改表定义后运行 `pnpm db:generate`，确认目标数据库后运行 `pnpm db:migrate`。生产构建默认使用 Webpack。
