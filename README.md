# testdog

品牌素材位于 `public/brand`，缺省页插画位于 `public/illustrations`，正式采用暖陶土橙侧脸猎犬标识，验证勾融入垂耳。浏览器图标位于 `src/app/icon.svg`。可打开 [素材预览](public/brand/preview.html) 或访问 `/brand/preview.html` 查看整套设计。为了兼容现有部署，`CASEFORGE_*` 环境变量、数据库名称和历史证据格式继续沿用。

基于 Next.js、PostgreSQL、Redis、Playwright 和 DeepSeek 的自然语言测试工作台。编写用例、录制执行、观察浏览器画面、查看逐步证据，并按记录重放操作。

## 本地运行

使用 Node.js 22.13+ 和 pnpm 12.10.1。CI 使用 Node.js 24；仓库通过 `packageManager` 固定 pnpm 版本。

```bash
pnpm install
cp .env.example .env
# 配置 DATABASE_URL 和 OPENAI_API_KEY
# 启动本地 PostgreSQL 和 Redis：
docker compose up -d
pnpm db:migrate
pnpm exec playwright install chromium webkit
pnpm dev
# 另一个终端启动执行 worker：
pnpm worker
# 可独立常驻维护服务，确保 worker 离线时仍回收超时任务：
pnpm maintenance
```

打开 http://localhost:3000，进入工作台：

- `/cases`（Tests）：创建、编辑、复制与删除用例，搜索名称、地址和标签，按最近执行状态筛选，发起录制。
- `/runs`（Results）：查看历史执行、状态和耗时。
- `/runs/:id`（Execution Studio）：观察持续更新的浏览器画面，查看每个步骤的前后截图、稳定定位器、断言证据和错误；拖动时间轴回看，播放完整录像，下载录像、Playwright Trace 或 JSON 报告；在计划画板中查看分组、分支和依赖，在 CodeMirror 中编辑录制操作与预期，保存版本后重放。

工作台使用 PostgreSQL 存储用例、执行快照、步骤和附件元数据。图片、视频和 Trace 存在 `.automation/artifacts`；可设置 `CASEFORGE_DATA_DIR` 指定附件数据目录。旧版本的 `.automation/workspace.json` 不再作为工作台数据源，原文件不会被删除。

每次执行保存用例快照。编辑或删除用例不会改变历史结果；删除用例后，历史记录仍可回看和重放。录制中的页面仅在有人观看实时画面时采样，默认每 3 秒一次；界面通过 SSE 接收执行增量，操作前后另外保存永久证据截图。实时预览只保留 Redis 中的最新帧，不进入历史回放时间线。视频和 Trace 在执行结束时完成归档。运行中可以停止执行。

“画面回看”播放保存的画面或录像；“重放操作”创建新的执行，使用记录中的稳定定位器、输入值和页面编号执行原动作顺序，重新验证原断言与条件分支，不调用模型重新规划动作。自然语言断言和分支验证仍需要模型；编辑器也支持直接执行原生 Playwright 断言。原始录制要求成功且每步均可稳定定位；失败录制可修正为独立版本后重放。编辑版本与执行快照保存在数据库，原始录制保持完整。重放可再次影响被测应用。

默认有界面运行 Chromium；服务器环境设置 `AUTOMATION_HEADLESS=true`。模型适配器使用 `OPENAI_API_KEY`，连接 DeepSeek。数据库和画面附件需要持久存储。

附件接口使用流式读取，录像拖动时仅读取浏览器请求的字节范围，避免将完整录像或 Trace 加载到服务端内存。支持 `HEAD` 查询文件大小；附件路径及其符号链接目标必须位于配置的附件目录内。

## 数据库与 API

结构、状态和接口示例见 [工作台接口文档](docs/workspace.md)。旧版 `case` 表及 `/api/cases` 接口已移除，工作台使用 `test_cases`；用户认证使用独立的 `auth_users`、`auth_sessions`、`auth_accounts` 和 `auth_verifications` 表。

Web 使用 Playwright mobile、Android/iOS 使用 agent-device 的架构见 [多平台自动化架构](docs/automation-architecture.md)，包含会话接口、设备调度、数据迁移、重放规则与实施验收。实现与验收证据、部署切换见 [实施记录](docs/automation-implementation.md)。

API 将任务持久化入队，独立常驻 Node worker 通过 PostgreSQL 行锁领取任务，每个浏览器 slot 或设备同一时间只执行一条测试。每 5 秒更新租约；60 秒未续约的执行标记为中断。每次执行最多 5 分钟，超时关闭浏览器并保存失败结果。当前部署适用于有本地持久磁盘的 Node 服务器；不适用于会冻结后台任务或没有持久磁盘的短生命周期函数。

## 实时更新与 Redis

API 和 worker 配置相同的 `REDIS_URL`、`CASEFORGE_REDIS_PREFIX`。本地 Compose 提供绑定在 `127.0.0.1:6380` 的 Redis 7（容器内部端口 6379），宿主机上的 API/worker 使用 `REDIS_URL=redis://localhost:6380`。Redis 使用 128 MB 内存上限及 LRU 淘汰；只承载可丢弃的实时数据，无需持久化。跨主机部署使用共享 Redis 服务，配置访问控制，按环境使用独立前缀；Redis Pub/Sub 不按逻辑数据库编号隔离。

PostgreSQL 仍负责任务调度、执行租约和永久证据。数据库触发器在业务事务内写入 `realtime_outbox`，API/worker 每 500ms 发布待发送通知。失败保留待发送项；成功记录保留一小时用于详情增量恢复，未发布记录最多保留 24 小时；超出保留范围通过快照恢复，避免长期中断时无限积压。通知可能重复，客户端按运行版本去重。心跳更新不生成业务事件；列表不接收截图、步骤、日志通知。详情通过 `/api/runs/:id/events` 接收快照、步骤、证据和日志增量，工作区通过 `/api/events` 接收列表失效通知。

SSE 重连从一致性快照恢复；连接中每 15 秒校验运行版本或列表事件标记，补齐丢失通知，事件有缺口时重取快照。每页共用一条连接，页面隐藏后关闭，恢复可见后重新同步；终态关闭详情连接。未配置 Redis 或连接失败时，运行中详情每 5 秒、活动列表每 10 秒、空闲列表每 30 秒降级轮询，历史详情不自动轮询。执行耗时由客户端计时。

实时画面只有处于执行视图、跟随最新画面且选择截图模式的可见页面才申请观看租约。每位观看者独立登记，45 秒到期，多位观看者共享采集。`CASEFORGE_PREVIEW_INTERVAL_MS` 默认为 3000，最低 1000；执行步骤或证据持久化繁忙时跳过采集。最新帧存 Redis 二进制值，60 秒到期、单帧最多 2 MB，经 `/api/runs/:id/preview` 鉴权读取。预览失败和 Redis 中断不影响执行结果；必要证据失败仍使归档不完整。原生密钥运行沿用不采集 live 画面的规则。

升级时先排空旧 worker，执行 `pnpm db:migrate`，配置 Redis，再启动新版 API 和 worker。反向代理需关闭 SSE 响应缓冲和缓存，并将空闲超时设置为大于 15 秒，推荐 HTTP/2。Redis 没有启动时仍可运行测试并保存证据，但不会产生临时预览。

隔离 Redis 集成验证会启动临时本地 Redis，使用随机端口和独立 key 前缀，不访问开发数据库：

```bash
CASEFORGE_TEST_REDIS_BINARY=/path/to/redis-server pnpm exec vitest run src/server/realtime/realtime.integration.test.ts
```

## 目录

```text
src/
  app/                 页面、布局与 API 路由
  features/            按业务功能组织的组件、hooks 与共享领域代码
    marketing/         首页演示与动效
    test-cases/        用例类型、校验、编辑、删除与平台矩阵弹窗
    workspace/         用例和执行记录列表、统计与数据订阅
    runs/              执行类型、校验、纯函数、播放器、画板与录制编辑
  components/          跨功能复用的组件
    ui/                基础交互组件
    shell/             工作区导航与布局
    shared/            错误状态等共用组件
  client/              浏览器端 JSON 请求、SWR 重试策略、SSE 与文件下载
  automation/          用例编译与统一计划执行
    compiler/          用例计划和动作 schema
    llm/               统一 ModelClient 契约与模型适配器
    evaluator.ts       注入模型的自然语言断言与分支判断
    planRunner.ts      注入 planner、session、evaluator 的公共编排
    platform/          统一会话协议、执行策略与目标配置
      web/             浏览器会话、观察、动作规划、执行与定位
      native/          Android/iOS 会话、规划、诊断与构建管理
  server/              API 与 worker 共用的后端业务层
    test-cases/        用例 CRUD 与数据访问
    runs/              执行记录、运行时、录制、日志与证据归档
    scheduling/        worker 注册、资源分配、租约与恢复
    realtime/          SSE、实时预览与事件发布
    shared/            鉴权、错误、HTTP、Redis 与模型装配
    testing/           隔离测试数据库辅助代码
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
RUN_WORKSPACE_LIVE_TESTS=true pnpm exec vitest run src/server/runs/liveRun.integration.test.ts
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

工作区默认使用 Better Auth 认证（开发环境同样需要登录）。未登录访问页面会跳转到 `/login`，业务 API 返回 401。原 Basic Auth 配置不再生效。

配置 `.env` 中的 `BETTER_AUTH_SECRET`（使用 `openssl rand -base64 32` 生成）和 `BETTER_AUTH_URL`（浏览器实际访问的完整站点 origin，生产环境使用 HTTPS），执行 `pnpm db:migrate` 后启动应用。访问 `/register` 使用姓名、邮箱和至少 8 位密码注册，或在 `/login` 登录；工作区侧栏显示当前用户并支持退出。邮箱注册使用密码认证，本次未启用邮件验证码、邮箱验证或找回密码，因此不需要 SMTP。

第三方登录支持 Google 和 GitHub。分别在提供商后台创建 OAuth 应用，配置 `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` 或 `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`；仅完整配置的提供商会显示按钮。回调地址分别为 `<BETTER_AUTH_URL>/api/auth/callback/google` 和 `<BETTER_AUTH_URL>/api/auth/callback/github`。OAuth 回调和密码校验由 Better Auth 处理，客户端不能读取服务端 secret。

用例和执行记录按 `userId` 隔离，用户 ID 从 Better Auth 会话获取，客户端不能指定归属。列表、搜索、最新执行状态、统计、取消、重放、录制版本、日志、模型调用、附件下载及实时事件均限制为当前用户的数据；访问其他用户的记录返回 404。相同幂等请求 ID 在不同用户之间独立生效。切换账号时重建前端缓存并断开旧实时订阅。

已有数据保留为 `userId = NULL`，迁移和新用户注册不会自动认领。需要保留给某个用户时，先注册该用户，再由运维显式执行 `pnpm assign:legacy user@example.com`，将所有无归属用例、执行历史、幂等记录在一个事务中分配给该用户。该命令不会转移已归属数据；幂等键冲突会回滚整个事务。本次迁移未执行数据认领。

受控本地部署和独立 UI 测试可显式设置 `CASEFORGE_ALLOW_UNAUTHENTICATED=true` 跳过页面保护，但匿名业务请求仅能访问无归属数据，已登录用户仍只访问自己的数据。构建目录和执行资源容量属于部署级共享设施；资源 API 不返回任务归属、执行 ID、租约或 worker 详情。认证集成参考 [Better Auth Next.js 文档](https://better-auth.com/docs/integrations/next) 和 [Drizzle 适配器文档](https://better-auth.com/docs/adapters/drizzle)。

worker 默认并发数为登记资源数，可用 CASEFORGE_WORKER_CONCURRENCY 降低。每条执行独占一个 slot/设备；排队默认上限 1 小时（CASEFORGE_QUEUE_TIMEOUT_MS），准备 2 分钟，执行 5 分钟，归档 30 秒。Web 归档超时后另给浏览器清理最多 10 秒；确认浏览器关闭后释放 slot，但证据不完整的执行仍标记失败并禁止重放。清理失败或超时才隔离该 Web slot；原生资源继续按设备清理与诊断结果判断能否释放。

浏览器日志使用独立的 `run_browser_logs` 表批量追加。升级此版本前先停止接收新执行并排空旧 worker，再运行 `pnpm db:migrate`，部署新版 API/worker；迁移会保留历史日志顺序，并清空运行主表里的旧日志 JSON。旧 worker 不应与新版同时写日志。Web 操作前后仍同步采集截图和快照，附件入库交给最多 16 项的共享队列；队列满时执行等待，保存失败会在后续操作或归档时报错。实时截图在步骤执行或证据入库繁忙时跳过，归档停止周期性日志刷新并等待证据队列排空后才确认完成。

隔离资源不因 TTL 自动释放。在同一 worker 主机与工作目录停止旧 worker 后运行 `pnpm recover:resource <resource-id>`。工具检查原主机和 PID、清理原命名 SDK 会话、验证快照和截图、关闭探测会话并确认无后端 claim；任一检查失败继续隔离。不会关闭其他用户的 SDK 会话。

平台表单支持构建、初始化策略、启动链接和输入引用。普通输入使用 `{"name":{"value":"Ada"}}`，密码使用 `{"password":{"secretRef":"LOGIN_PASSWORD"}}`，步骤用 `${input.password}` 引用，worker 配置 CASEFORGE_SECRET_LOGIN_PASSWORD。密钥仅在密码控件中解析，不进入模型规划或录制代码。Web 密钥运行关闭视频/trace并遮罩密码截图，日志脱敏；原生依赖 secure 控件的系统遮罩。不要在目标或步骤里填入明文密钥。

“矩阵”入口接受 1–10 项 target/goal 配置，各平台可覆盖输入和预期；整批事务提交，通过 batchId 关联。

真实设备适配器验证使用自建测试应用：

```bash
RUN_DEVICE_LIVE_TESTS=true CASEFORGE_ANDROID_SERIAL=emulator-5580 ANDROID_SDK_ROOT=/path/to/android-sdk pnpm exec vitest run src/automation/platform/native/agentDevice.live.test.ts
```

该测试为 iOS 创建并删除独立 simulator；Android 需要指定已启动的专用 emulator。Android fixture 编译使用 SDK 36 与 build-tools 36.0.0，Java 路径可用 CASEFORGE_JAVA_HOME 设置。

浏览器工作台验收使用真实页面和隔离 API fixtures：启动本地服务后运行 `CASEFORGE_UI_URL=http://localhost:3015 pnpm exec vitest run src/features/workspace/workspace.live.test.ts`。
