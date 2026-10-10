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
pnpm exec playwright install chromium webkit
pnpm dev
# 另一个终端启动执行 worker：
pnpm worker
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

Web 使用 Playwright mobile、Android/iOS 使用 agent-device 的架构见 [多平台自动化架构](docs/automation-architecture.md)，包含会话接口、设备调度、数据迁移、重放规则与实施验收。实现与验收证据、部署切换见 [实施记录](docs/automation-implementation.md)。

API 将任务持久化入队，独立常驻 Node worker 通过 PostgreSQL 行锁领取任务，每个浏览器 slot 或设备同一时间只执行一条测试。每 5 秒更新租约；60 秒未续约的执行标记为中断。每次执行最多 5 分钟，超时关闭浏览器并保存cp失败结果。当前部署适用于有本地持久磁盘的 Node 服务器；不适用于会冻结后台任务或没有持久磁盘的短生命周期函数。

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
  workspace/           共享类型、校验、录制脚本解析与计划树
    server/            数据库仓库、步骤记录、画面附件与运行生命周期
  db/                  Drizzle 表定义与 PostgreSQL 连接
drizzle/              数据库迁移
docs/                 数据模型和 API 文档
```

## 验证

提交前运行统一检查；遇到失败会立即停止后续步骤：

```bash
pnpm check
```

该命令依次检查格式、Lint、类型、默认测试，再构建生产版本并执行 UI 测试。`.github/workflows/quality.yml` 在 push 和 pull request 时执行相同检查，使用锁文件安装依赖和真实 Chromium。CI 不连接实际数据库或调用真实模型。浏览器组件的 Lint 规则禁止直接导入数据库、仓库、模型适配器和运行器等服务端模块，覆盖别名、相对路径与显式扩展名；纯类型导入和共享工具允许使用。`tests/architecture.test.ts` 用实际 ESLint 配置验证这些边界。

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

默认测试使用隔离的 PostgreSQL WASM 引擎和真实 Chromium，不连接 `.env` 的远程数据库，不调用真实模型。最多并发四个工作进程，避免多个数据库引擎和浏览器抢占资源。真实模型测试只接受启动命令显式设置的开关，`.env` 中的同名设置不会启用这些测试。

真实模型录制与重放验证使用本地示例网站和隔离数据库，可单独运行：

```bash
RUN_WORKSPACE_LIVE_TESTS=true pnpm exec vitest run src/workspace/server/liveRun.integration.test.ts
```

只验证用例编译的原有集成测试：

```bash
RUN_LIVE_TESTS=true pnpm exec vitest run src/automation/compiler/textCompiler.integration.test.ts
```

下载 Trace 后，可以通过 `pnpm exec playwright show-trace <trace.zip>` 查看页面快照和浏览器动作。

修改表定义后运行 `pnpm db:generate`，确认目标数据库后运行 `pnpm db:migrate`。生产构建默认使用 Webpack。

升级到多平台 worker 前，停止旧 API 接收执行并等待或停止旧后台执行进程，再运行迁移、部署新 API 并启动 `pnpm worker`。cutover 迁移会终结旧租约缺失的未完成任务，不能代替停止旧进程；历史桌面录制和附件保留。

执行回放支持 Console 与 Network 记录：包含控制台输出、未捕获页面异常，以及请求方法、URL、状态码、耗时、请求/响应头和失败原因。可搜索、筛选错误，并按当前步骤或画面回放时间查看；录制和重放均会采集，失败或停止后保留已采集记录。每次执行最多采集 2000 条，单条文本最多 16000 字符，请求头中的认证、Cookie 与 token 字段会隐藏。请求/响应正文暂不采集。历史执行不会补录，需重新执行。升级后先运行 `pnpm db:migrate`。

## 平台 worker

新建 Web 用例默认 Pixel 7 / Chromium，可选择 iPhone 13 / WebKit；旧记录继续使用桌面配置。原生用例使用 agent-device 0.21.24，设备配置由 worker 登记。多个 worker 可共享同一个 PostgreSQL，设备不能重复注册为不同资源。

```bash
# 本机 Web worker（默认一个浏览器 slot）
pnpm worker

# 原生 worker：以实际设备标识替换示例，iOS 需要 macOS/Xcode
CASEFORGE_HOST_ID=mac-worker CASEFORGE_RESOURCES='[{"id":"mac-worker:iphone","platform":"ios","profileId":"iphone","deviceId":"实际 UDID"}]' pnpm worker
CASEFORGE_HOST_ID=android-worker CASEFORGE_RESOURCES='[{"id":"android-worker:pixel","platform":"android","profileId":"pixel","deviceId":"实际 ADB serial"}]' pnpm worker

# 登记已构建的 APK 或 simulator .app；输出构建 ID 和摘要
pnpm register:build android /path/to/app.apk
pnpm register:build ios /path/to/App.app
```

API 和 worker 连接同一个数据库。本地附件模式需共享 CASEFORGE_DATA_DIR；跨主机部署可设置 CASEFORGE_ARTIFACT_BUCKET、CASEFORGE_ARTIFACT_PREFIX、AWS_REGION 和 AWS 凭据，兼容 S3 的服务另设 CASEFORGE_ARTIFACT_ENDPOINT。对象保持私有，API 校验运行和附件归属后读取，支持 Range。应用构建需在设备 worker 主机登记或使用共享构建目录。

生产模式默认要求认证。设置 CASEFORGE_AUTH_USER 和 CASEFORGE_AUTH_PASSWORD，通过 HTTPS 访问；浏览器使用标准认证对话框，API 使用 Basic Authorization。CASEFORGE_REQUIRE_AUTH=true 可在开发模式强制认证；受控本地部署可显式设置 CASEFORGE_ALLOW_UNAUTHENTICATED=true。

worker 默认并发数为登记资源数，可用 CASEFORGE_WORKER_CONCURRENCY 降低。每条执行独占一个 slot/设备；排队默认上限 1 小时（CASEFORGE_QUEUE_TIMEOUT_MS），准备 2 分钟，执行 5 分钟，归档 30 秒。Web 归档超时后另给浏览器清理最多 10 秒；确认浏览器关闭后释放 slot，但证据不完整的执行仍标记失败并禁止重放。清理失败或超时才隔离该 Web slot；原生资源继续按设备清理与诊断结果判断能否释放。

浏览器日志使用独立的 `run_browser_logs` 表批量追加。升级此版本前先停止接收新执行并排空旧 worker，再运行 `pnpm db:migrate`，部署新版 API/worker；迁移会保留历史日志顺序，并清空运行主表里的旧日志 JSON。旧 worker 不应与新版同时写日志。Web 操作前后仍同步采集截图和快照，附件入库交给最多 16 项的共享队列；队列满时执行等待，保存失败会在后续操作或归档时报错。实时截图在步骤执行或证据入库繁忙时跳过，归档停止周期性日志刷新并等待证据队列排空后才确认完成。

隔离资源不因 TTL 自动释放。在同一 worker 主机与工作目录停止旧 worker 后运行 `pnpm recover:resource <resource-id>`。工具检查原主机和 PID、清理原命名 SDK 会话、验证快照和截图、关闭探测会话并确认无后端 claim；任一检查失败继续隔离。不会关闭其他用户的 SDK 会话。

平台表单支持构建、初始化策略、启动链接和输入引用。普通输入使用 `{"name":{"value":"Ada"}}`，密码使用 `{"password":{"secretRef":"LOGIN_PASSWORD"}}`，步骤用 `${input.password}` 引用，worker 配置 CASEFORGE_SECRET_LOGIN_PASSWORD。密钥仅在密码控件中解析，不进入模型规划或录制代码。Web 密钥运行关闭视频/trace并遮罩密码截图，日志脱敏；原生依赖 secure 控件的系统遮罩。不要在目标或步骤里填入明文密钥。

“矩阵”入口接受 1–10 项 target/goal 配置，各平台可覆盖输入和预期；整批事务提交，通过 batchId 关联。

真实设备适配器验证使用自建测试应用：

```bash
RUN_DEVICE_LIVE_TESTS=true CASEFORGE_ANDROID_SERIAL=emulator-5580 ANDROID_SDK_ROOT=/path/to/android-sdk pnpm exec vitest run src/automation/platform/agentDevice.live.test.ts
```

该测试为 iOS 创建并删除独立 simulator；Android 需要指定已启动的专用 emulator。Android fixture 编译使用 SDK 36 与 build-tools 36.0.0，Java 路径可用 CASEFORGE_JAVA_HOME 设置。

浏览器工作台验收使用真实页面和隔离 API fixtures：启动本地服务后运行 `CASEFORGE_UI_URL=http://localhost:3015 pnpm exec vitest run src/components/workspace.live.test.ts`。
