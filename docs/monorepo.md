# Monorepo 与独立部署

Web 与 worker 是两个独立部署的应用。Web 负责界面、鉴权、API 和任务提交；worker 负责领取任务、租约、资源和自动化执行。worker 使用平台 provider，并通过现有 PostgreSQL 队列与 Web 协作。此次迁移保留数据库结构、API 和执行协议。

## 包与依赖方向

| 包                    | 职责                               | workspace 依赖                |
| --------------------- | ---------------------------------- | ----------------------------- |
| `@testdog/web`        | Next.js 页面、API、客户端与 UI     | contracts、automation、server |
| `@testdog/worker`     | 执行、维护、通知与运维入口         | contracts、automation、server |
| `@testdog/server`     | 业务、调度、数据库与证据存储       | contracts、automation         |
| `@testdog/automation` | 执行引擎、模型与平台适配           | contracts                     |
| `@testdog/contracts`  | 共享类型、校验、录制解析和平台协议 | 无                            |

共享包通过明确的子路径导出，例如 `@testdog/server/runs/submission`、`@testdog/contracts/runs/types`，避免聚合入口将服务端实现带入浏览器。应用内部继续使用 `@/`，共享包不使用应用路径别名。用户会话、鉴权和 SSE HTTP 入口属于 Web 应用，worker 不安装认证框架及其 Web 依赖。原生构建记录由 server 校验并注入设备会话；执行引擎不依赖数据库。contracts 中的 Playwright 引用仅为类型。

`packages/server` 目前仍包含 API 和执行节点共用的业务；Web 的编译接口也需要模型适配器，因此 Web 依赖 automation。Web 不运行浏览器或设备任务，但其依赖闭包仍包含部分执行 SDK。后续若要进一步缩小 Web 镜像，可按实际运行依赖拆分平台包。

## 本地运行与检查

在仓库根目录安装并运行：

```bash
pnpm install --frozen-lockfile
cp .env.example .env
pnpm db:migrate
pnpm dev
# 另一个终端
pnpm worker
```

也可以使用 `pnpm --filter @testdog/web dev`、`pnpm --filter @testdog/worker dev`。两个应用在本地 workspace 中读取根目录 `.env`，已有进程环境变量优先；根目录 `.automation` 仍是默认数据目录。应用目录的 `.env` 优先于根目录配置。生产环境显式设置绝对路径 `CASEFORGE_DATA_DIR`，避免服务工作目录影响持久数据位置。

根命令 `pnpm maintenance`、`pnpm notifications` 和构建登记、恢复、认领、回填命令保留，入口位于 `apps/worker/src`。数据库迁移继续位于根目录 `drizzle`，配置指向 `packages/server/src/db/schema.ts`。迁移由部署流程执行一次，不由各应用启动时自动执行。

```bash
pnpm typecheck       # Web、共享包、worker 和跨包测试的类型检查
pnpm test            # 全仓库单元、集成与架构检查
pnpm build:web
pnpm build:worker
pnpm test:ui         # 构建 Web 后执行 UI 测试
pnpm check           # CI 统一入口，包含两端构建
```

## Web 部署产物

```bash
pnpm package:web /tmp/testdog-web-release
cd /tmp/testdog-web-release
HOSTNAME=0.0.0.0 PORT=3000 node apps/web/server.js
```

打包使用 Next.js standalone 输出，并补齐 `public` 和 `.next/static`。输出目录必须尚不存在，工具不会覆盖已有部署。将整个输出目录部署到 Node.js 服务器，无需复制 worker 应用或仓库开发依赖；运行时配置通过服务环境变量提供，本地 `.env` 不复制到产物。

直接在完整仓库部署也可以使用 `pnpm build:web` 和 `pnpm start`。

## Worker 部署产物

```bash
pnpm package:worker /tmp/testdog-worker-release
cd /tmp/testdog-worker-release
node dist/worker.mjs
# 可选择独立常驻维护或通知进程
node dist/maintenance.mjs
node dist/notifications.mjs
```

worker 通过 esbuild 将 workspace 代码打包为 Node.js ESM，第三方依赖保留为外部模块。`pnpm deploy --legacy --prod` 生成可搬运的生产依赖目录，不包含 Next.js、React 或 Web 应用。产物需要与构建时的平台、CPU 架构兼容；面向 Linux 部署时在对应 Linux 构建环境打包。

构建还输出 `register-build.mjs`、`recover-resource.mjs`、`assign-legacy-data.mjs` 和 `backfill-issues.mjs`，参数沿用根目录对应命令。打包后可以用 Node.js 直接运行，不需要 TypeScript 执行器。

Web 执行节点需要另外安装浏览器及其系统依赖：

```bash
node node_modules/playwright/cli.js install --with-deps chromium webkit
```

原生设备节点仍需相应 SDK、设备访问权限；本地 iOS worker 运行在 macOS。浏览器缓存、SDK 和设备资源不包含在 JavaScript 产物中。

## 两端共享配置

两端使用相同的 `DATABASE_URL`、`REDIS_URL` 和 `CASEFORGE_REDIS_PREFIX`。登录身份与集成配置的加密密钥也需要一致；模型密钥提供给需要编译或执行语义判断的服务。每个 worker 配置自己的 `CASEFORGE_HOST_ID`、资源和并发数。

跨主机部署通过 `CASEFORGE_ARTIFACT_BUCKET` 使用同一个私有证据存储，或挂载两端可访问且路径一致的持久共享目录。只设置同名本地目录不会让不同主机共享文件。实时画面仍通过 Redis，历史截图、录像、Trace 和附件由持久存储提供。

原生构建登记保存的是文件路径；需要在实际执行该构建的设备节点登记，或让相关节点共享同路径的构建目录。证据对象存储不会自动分发原生构建文件。

升级时排空旧 worker，运行数据库迁移，再部署兼容的 Web 和 worker。独立部署支持分别重启与扩容；共享数据库结构和任务快照仍要求版本兼容。
