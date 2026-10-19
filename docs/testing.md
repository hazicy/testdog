# 测试与验证

本文是当前验证命令与启用条件的权威说明。实施记录中的测试数量是历史证据，不代表当前测试数量或外部环境已完成验收。

## 默认检查

```bash
pnpm check
```

依次检查格式、Lint、类型、默认测试、worker 构建，再构建 Web 并运行 UI 测试；失败立即停止。CI 的 `.github/workflows/quality.yml` 使用 Node.js 24、锁文件安装和真实 Chromium 执行同一入口。也可分别运行：

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:ui
```

类型检查由各应用和包覆盖自己的源码与同目录测试，Web 同时生成 Next.js 路由类型；根 `typecheck:repo` 只检查 `tests/` 和根配置。被导入的源码仍按需读取。涉及证据归档、数据库和构建登记的跨包集成测试位于 server；automation 的测试只依赖执行引擎和共享协议。类型检查不依赖其他包构建产物，因此使用 `--no-sort`。

默认测试使用隔离 PGlite 与真实 Chromium，不连接 `.env` 的远程数据库，不调用真实模型。Vitest 最多并发四个进程。`pnpm test:ui` 使用生产构建与 API mock，要求本机 3100 端口可用。浏览器组件的导入边界由 ESLint 和 `tests/architecture.test.ts` 检查。

UI 基础数据工厂与公共路由设置位于 `tests/ui/fixtures/`。工厂返回共享契约类型并创建独立数据；测试显式覆盖关键差异。错误响应、请求计数、延迟、SSE、录像 Range 等行为保留在测试本身，不塞进公共 mock 配置。

## 按需集成验证

真实模型开关只接受启动命令显式设置；`.env` 中的同名开关不会启用真实模型测试。以下命令分别验证完整录制/重放和只编译用例：

```bash
RUN_WORKSPACE_LIVE_TESTS=true pnpm exec vitest run packages/server/src/runs/liveRun.integration.test.ts
RUN_LIVE_TESTS=true pnpm exec vitest run packages/automation/src/compiler/textCompiler.integration.test.ts
```

Redis 集成测试启动临时本地 Redis，使用随机端口和独立 key 前缀，不访问开发数据库：

```bash
TESTDOG_TEST_REDIS_BINARY=/path/to/redis-server pnpm exec vitest run packages/server/src/realtime/realtime.integration.test.ts
```

独立 PostgreSQL 调度验证只接受本地、名称以 `testdog_test_` 开头的数据库，使用临时 schema 并清理，不读取 `DATABASE_URL`。同时设置 `TESTDOG_ANDROID_SERIAL` 可验证原生健康恢复，设备必须专用于测试：

```bash
TESTDOG_TEST_DATABASE_URL=postgresql://user@127.0.0.1:5432/testdog_test_scheduler pnpm exec vitest run packages/server/src/scheduling/scheduler.postgres.test.ts
```

真实设备验证使用自建测试 app。Android 需指定已启动的专用 emulator、SDK 36 和 build-tools 36.0.0，Java 路径可用 `TESTDOG_JAVA_HOME` 指定；iOS 会创建并删除独立 simulator，需要 macOS/Xcode：

```bash
RUN_DEVICE_LIVE_TESTS=true TESTDOG_ANDROID_SERIAL=emulator-5580 ANDROID_SDK_ROOT=/path/to/android-sdk pnpm exec vitest run packages/server/src/runs/agentDevice.live.test.ts
```

浏览器工作台的 live 验收需要先启动本地服务，仍使用隔离 API fixtures：

```bash
TESTDOG_UI_URL=http://localhost:3015 pnpm exec vitest run apps/web/src/features/workspace/workspace.live.test.ts
```

查看下载的 Playwright Trace：

```bash
pnpm exec playwright show-trace <trace.zip>
```

原生 trace 有独立 producer/format，不能作为 Playwright Trace 打开。模拟合同测试、emulator/simulator 验收与真机验收各有不同范围；历史通过记录不能替代当前环境验证。

## 多轮真实模型回归基线

运行本地可控页面上的 10 个引擎场景：登录、搜索按钮、回车搜索、确认删除、取消删除、下拉选择、条款勾选、异步加载、同名按钮与链接、订阅表单。每轮重新从自然语言编译和录制，再重放该轮录制；默认三轮，共 60 次执行。它用于衡量引擎稳定性，不代表真实业务环境已验收。

```bash
RUN_WORKSPACE_LIVE_TESTS=true pnpm test:regression
# 首次验证可先执行一轮或只运行某个场景
RUN_WORKSPACE_LIVE_TESTS=true TESTDOG_REGRESSION_ROUNDS=1 pnpm test:regression
RUN_WORKSPACE_LIVE_TESTS=true pnpm test:regression -t 'dialog:'
```

需要配置真实模型凭据并安装 Chromium；真实调用会产生模型费用。轮数支持 1～10，入口继续要求进程显式开启真实模型测试，默认测试不会发起模型请求。使用隔离 PGlite、随机本地端口和本地附件目录，不写开发数据库或配置中的 S3。

结果保存到 `test-results/regression/<时间>/`：`summary.json` 包含计划数、已完成数、通过数、通过率、每次耗时、错误码和模型用量；逐次 JSON 保留执行步骤和附件索引，截图、视频等保留在同目录的 `artifacts/` 下。每次执行后更新汇总，中断时可检查已完成部分。无模型用量的请求通过 `unknownUsage` 表示，不能将已知 token 汇总理解为完整费用。

通过必须同时满足执行成功、证据完整、页面向本地服务提交的实际结果符合预期；最后一项独立于模型断言。录制失败时，本轮重放记录为阻塞失败，不跳过或计为成功；其他场景和轮次继续运行。汇总保留错误原文供人工区分产品、定位、断言和环境问题，不自动推断根因。报告与证据保存在已忽略的目录中。

这些页面不连接真实登录和订单后端。接入实际业务时，需要另外确定测试环境、专用账号和数据清理策略，保留本地基线以区分引擎变化与业务变化。
