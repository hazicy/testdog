# 配置、部署与运维

本文是环境配置、部署产物、服务组合、数据库升级与运维命令的权威说明。本地首次运行的最短路径见 [快速开始](../README.md#快速开始)，开发约定见 [开发指南](development.md)，验证命令见 [测试指南](testing.md)。实现记录中的统计和验收结论仅表示记录时的状态。

## 环境配置

使用仓库 `package.json` 指定的 Node.js 和 pnpm 版本。环境变量清单及示例值在 [.env.example](../.env.example)；`CASEFORGE_*` 名称继续沿用以兼容既有部署。

本地 workspace 默认读取根目录 `.env`，应用目录 `.env` 优先，已有进程环境变量优先于文件。根目录 `.automation` 是默认数据目录。部署产物不复制本地 `.env`，生产服务通过自己的环境变量提供配置，并为数据使用绝对路径。配置变更后重启所有使用该配置的 API、worker 或后台进程。执行节点需要常驻 Node.js 进程和持久存储。

| 配置                                                                                                                      | 使用范围与要求                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                                                                            | API、worker 与后台服务连接同一个 PostgreSQL；数据库必须持久化                                                                                      |
| `OPENAI_API_KEY`                                                                                                          | 提供给需要编译或执行语义判断的服务，当前模型适配器连接 DeepSeek                                                                                    |
| `AUTOMATION_HEADLESS`                                                                                                     | 本地默认有界面，服务器设置为 `true`                                                                                                                |
| `REDIS_URL`、`CASEFORGE_REDIS_PREFIX`                                                                                     | API、worker 与 outbox 发布进程使用相同值，按环境区分前缀                                                                                           |
| `CASEFORGE_DATA_DIR`                                                                                                      | 本地附件持久目录，生产使用绝对路径；跨主机存储见下文                                                                                               |
| `BETTER_AUTH_SECRET`、`BETTER_AUTH_URL`                                                                                   | Web 必填；secret 至少 32 字符，URL 为实际访问 origin，生产使用 HTTPS                                                                               |
| `CASEFORGE_INTEGRATION_SECRET`                                                                                            | API、执行与通知进程保持一致，至少 32 字符；未设置时使用 `BETTER_AUTH_SECRET`，用于通知、浏览器提供方及登录身份的加密；更换密钥后需重新配置加密数据 |
| `CASEFORGE_SMTP_HOST`、`CASEFORGE_SMTP_PORT`、`CASEFORGE_SMTP_USERNAME`、`CASEFORGE_SMTP_PASSWORD`、`CASEFORGE_SMTP_FROM` | API 和通知发送进程配置平台邮件服务；支持 465 TLS、587 STARTTLS；用户仅在界面配置收件人                                                             |
| `CASEFORGE_ALLOW_PRIVATE_SMTP`                                                                                            | 可信内网 SMTP 可显式设置 `true`，TLS 校验仍开启                                                                                                    |
| `CASEFORGE_PREVIEW_INTERVAL_MS`                                                                                           | 实时画面默认 3000 ms，最低 1000 ms；不改变永久证据采集                                                                                             |
| `CASEFORGE_AI_*`                                                                                                          | 模型预算参数，示例值见环境变量清单，预算语义见 [工作台文档](workspace.md#租约维护与模型预算)                                                       |

### 认证

工作区默认使用 Better Auth，开发环境同样需要登录。未登录页面跳转到 `/login`，业务 API 返回 401；原 Basic Auth 配置不再生效。可用下列命令生成认证密钥，再将结果写入服务环境配置：

```bash
openssl rand -base64 32
```

访问 `/register` 注册邮箱账号，或在 `/login` 登录。当前没有邮件验证码、邮箱验证和找回密码流程，邮箱密码登录不要求 SMTP。

第三方登录可配置 `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` 或 `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`。仅完整配置的提供方显示按钮；在提供商后台将回调地址设置为 `<BETTER_AUTH_URL>/api/auth/callback/google` 或 `<BETTER_AUTH_URL>/api/auth/callback/github`。

受控本地部署和独立 UI 测试可以显式设置 `CASEFORGE_ALLOW_UNAUTHENTICATED=true`。匿名业务请求只访问无归属数据，已登录用户仍只访问自己的数据。用户隔离规则见 [工作台文档](workspace.md#用户数据归属)。

### Redis 与反向代理

本地 Compose 的 Redis 绑定宿主机 `127.0.0.1:6380`，容器内部端口为 6379；宿主机服务使用 `REDIS_URL=redis://localhost:6380`。Redis 只承载可丢弃的实时数据，使用 128 MB 上限和 LRU 淘汰，不需要持久化。跨主机部署使用共享 Redis 并配置访问控制；Pub/Sub 不按逻辑数据库编号隔离，环境前缀必须不同。

反向代理对 SSE 关闭响应缓冲和缓存，空闲超时大于 15 秒，推荐 HTTP/2。未配置 Redis 或连接中断时页面降级轮询；执行与永久证据不依赖实时预览。协议与保留规则见 [工作台文档](workspace.md)。

### 附件与原生构建存储

API 和 worker 需要访问同一份证据。本地附件模式挂载两端可访问、路径一致的持久目录；不同主机仅设置同名本地目录不会共享文件。跨主机可配置同一私有 S3 存储的 `CASEFORGE_ARTIFACT_BUCKET`、`CASEFORGE_ARTIFACT_PREFIX`、`AWS_REGION` 与 AWS 凭据；兼容 S3 的服务另设 `CASEFORGE_ARTIFACT_ENDPOINT`。对象保持私有，API 校验归属后提供附件和 Range 请求。

原生构建登记保存文件路径，必须在实际设备节点登记，或让相关节点共享同路径的构建目录。证据对象存储不会自动分发 APK 或 `.app`。

## 默认服务组合

默认部署是 Web + worker。worker 同时运行租约维护、通知发送和 outbox 发布，不需要额外启动 maintenance 或 notifications。Web 的实时 HTTP 入口也会启动 outbox 发布，数据库锁协调发布批次。

如需设备 worker 离线时仍运行后台服务，使用 Web + 独立 maintenance + 执行 worker。完整仓库中的命令为：

```bash
pnpm maintenance
CASEFORGE_BACKGROUND_SERVICES=none pnpm worker
```

所有后台入口共用 `CASEFORGE_BACKGROUND_SERVICES`。未配置时使用下表默认组合；`none` 关闭后台服务，或用逗号分隔的 `maintenance,notifications,outbox` 选择子集。

| 入口          | 默认职责                             |
| ------------- | ------------------------------------ |
| worker        | 领取执行任务 + 维护 + 通知 + outbox  |
| maintenance   | 维护 + 通知 + outbox，不领取执行任务 |
| notifications | 仅发送通知                           |

需要单独扩容通知时，maintenance 使用 `CASEFORGE_BACKGROUND_SERVICES=maintenance,outbox`，另启 `pnpm notifications`。单独运行 outbox 可使用 `CASEFORGE_BACKGROUND_SERVICES=outbox pnpm maintenance`。多进程通过数据库锁协调；不需要在每个执行 worker 中重复配置后台服务。

SIGINT/SIGTERM 会停止领取任务，取消并等待当前执行，等待后台批次结束，再关闭 Redis 和数据库；启动或退出失败也执行清理。

## 部署产物

Web 和 worker 可以分别构建、发布和扩容，共享数据库结构与任务快照需要版本兼容。输出目录必须尚不存在，打包工具不会覆盖已有部署。

### Web

```bash
pnpm package:web /tmp/testdog-web-release
cd /tmp/testdog-web-release
HOSTNAME=0.0.0.0 PORT=3000 node apps/web/server.js
```

Next.js standalone 输出包含 `public` 和 `.next/static`。部署整个输出目录，无需复制 worker 应用或仓库开发依赖。在完整仓库直接部署也可使用 `pnpm build:web` 和 `pnpm start`。

#### Vercel

Web 应用的部署配置在 `apps/web/vercel.json`，只构建 Web，不运行仓库根目录包含 worker 的 `build` 脚本。

在 Vercel 项目的 Build and Deployment 设置中，将 **Root Directory** 设为 `apps/web`，并启用 **Include source files outside of the Root Directory in the Build Step**，以便安装 pnpm workspace 依赖并访问 `packages/*`。安装命令使用平台默认值，框架为 Next.js；构建命令和 `.next` 输出目录由应用配置提供。保存后重新部署。

出现 `No Next.js version detected` 时，首先检查 Root Directory。仓库根 `package.json` 只声明仓库工具，Next.js 依赖由 `apps/web/package.json` 的 `catalog:` 引用根 `pnpm-workspace.yaml` 中的版本。Root Directory 是远端项目设置，不能用 `vercel.json` 中的 `rootDirectory` 字段覆盖。参见 [Vercel monorepo 配置](https://vercel.com/docs/monorepos/monorepo-faq)。

worker 仍按下文独立部署到常驻执行节点；Web 与 worker 使用相同的 PostgreSQL，并按环境配置共享 Redis 和附件存储。

### Worker

```bash
pnpm package:worker /tmp/testdog-worker-release
cd /tmp/testdog-worker-release
node node_modules/playwright/cli.js install --with-deps chromium webkit
node dist/worker.mjs
```

worker 使用 esbuild 将 workspace 代码打包为 Node.js ESM，第三方依赖保留为外部模块，`pnpm deploy --legacy --prod` 生成生产依赖目录。产物不包含 Next.js、React 或 Web 应用，需要与部署平台、CPU 架构兼容；Linux 部署在相应 Linux 环境打包。

分离部署时，产物中的组合对应为 `node dist/maintenance.mjs` 和 `CASEFORGE_BACKGROUND_SERVICES=none node dist/worker.mjs`；独立通知使用 `node dist/notifications.mjs`。还会输出 `register-build.mjs`、`recover-resource.mjs`、`assign-legacy-data.mjs`、`backfill-issues.mjs`，参数与下文仓库命令相同。

浏览器缓存、系统依赖、原生 SDK 和设备权限不包含在 JavaScript 产物中。

## 平台与资源

worker 默认登记一个本机 Web slot。原生资源必须提供明确设备 ID；Android 需要 Android SDK/ADB，本地 iOS 需要 macOS/Xcode。多个 worker 不应将同一设备重复登记为不同资源。

```bash
CASEFORGE_HOST_ID=mac-worker CASEFORGE_RESOURCES='[{"id":"mac-worker:iphone","platform":"ios","profileId":"iphone","deviceId":"实际 UDID"}]' pnpm worker
CASEFORGE_HOST_ID=android-worker CASEFORGE_RESOURCES='[{"id":"android-worker:pixel","platform":"android","profileId":"pixel","deviceId":"实际 ADB serial"}]' pnpm worker
pnpm register:build android /path/to/app.apk
pnpm register:build ios /path/to/App.app
```

默认并发数为登记资源数，`CASEFORGE_WORKER_CONCURRENCY` 可降低并发。每条执行独占资源；排队默认上限一小时（`CASEFORGE_QUEUE_TIMEOUT_MS`），准备两分钟、执行五分钟、归档三十秒，Web 归档后清理浏览器另有十秒上限。未确认清理的资源保持隔离。

目标中的密钥输入只保存引用。例如 `password: {secretRef: "LOGIN_PASSWORD"}` 对应执行进程的 `CASEFORGE_SECRET_LOGIN_PASSWORD`。普通输入、平台目标和证据保护语义见 [架构说明](automation-architecture.md#目标与执行快照)。

## 数据库迁移与升级

迁移由部署流程执行一次，各应用启动时不会自动迁移。修改表结构后生成迁移的开发步骤见 [开发指南](development.md#数据库结构修改)。

1. 停止旧 API 接收新执行和所有旧版本写入者；排空或停止旧 worker、maintenance、notifications。
2. 确认迁移进程的 `DATABASE_URL` 指向目标数据库，执行 `pnpm db:migrate`。
3. 部署兼容的 Web、worker 和选定后台服务，确认共享配置后启动。

首次安装也需要迁移后再启动应用。历史 expand/backfill/cutover 迁移保留桌面配置、录制及证据；cutover 终结旧租约缺失的未完成任务，不能代替停止旧进程。后续删除旧日志、事件、worker 跟踪和 URL 列的迁移与旧版应用不兼容，需更新所有写入者；新版本依赖冻结的重放快照。迁移拒绝冲突或无法回填的活跃重放时，先核对并修复或终结这些旧任务，再重试。历史检查记录见 [数据库检查](database-review.md)。

## 显式运维操作

历史无归属数据不会自动分配给新账号。需要认领时先注册目标用户，再执行：

```bash
pnpm assign:legacy user@example.com
```

该命令在一个事务中认领全部无归属用例、执行历史和幂等记录，不转移已有归属；幂等键冲突会回滚。

隔离资源不会因 TTL 自动释放。在原 worker 主机与工作目录停止旧 worker 后，执行：

```bash
pnpm recover:resource <resource-id>
```

工具检查原主机和 PID、清理原 SDK 会话、验证快照和截图、关闭探测会话并确认无后端 claim；任一检查失败继续隔离，不会关闭其他用户的 SDK 会话。

历史失败不会由 GET 请求补录问题，可按范围显式回填，保留来源归属并支持重复执行：

```bash
pnpm issues:backfill --user <用户ID>
pnpm issues:backfill --unowned
pnpm issues:backfill --all
```
