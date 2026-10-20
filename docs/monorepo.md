# Monorepo 结构与依赖方向

Web 与 worker 是两个独立部署的应用。Web 负责界面、鉴权、API 和任务提交；worker 负责领取任务、租约、资源和自动化执行。worker 使用平台 provider，并通过现有 PostgreSQL 队列与 Web 协作。部署与运维操作统一见 [部署指南](deployment.md)。

## 包与依赖方向

| 包                   | 职责                               | workspace 依赖            |
| -------------------- | ---------------------------------- | ------------------------- |
| `@testdog/web`       | Next.js 页面、API、客户端与 UI     | contracts、engine、server |
| `@testdog/worker`    | 执行、维护、通知与运维入口         | contracts、engine、server |
| `@testdog/server`    | 业务、调度、数据库与证据存储       | contracts、engine         |
| `@testdog/engine`    | 执行引擎、模型与平台适配           | contracts                 |
| `@testdog/contracts` | 共享类型、校验、录制解析和平台协议 | 无                        |

共享包通过明确的子路径导出，例如 `@testdog/server/runs/submission`、`@testdog/contracts/runs/types`，避免聚合入口将服务端实现带入浏览器。应用内部继续使用 `@/`，共享包不使用应用路径别名。用户会话、鉴权和 SSE HTTP 入口属于 Web 应用，worker 不安装认证框架及其 Web 依赖。原生构建记录由 server 校验并注入设备会话；执行引擎不依赖数据库。contracts 中的 Playwright 引用仅为类型；录制操作到重放步骤的纯转换和工作台响应类型也由 contracts 定义。包依赖方向同时约束开发依赖，涉及 server 的跨包集成测试归属 server，避免测试引入依赖环。

`packages/server` 目前仍包含 API 和执行节点共用的业务；Web 的编译接口也需要模型适配器，因此 Web 依赖 engine。Web 不运行浏览器或设备任务，但其依赖闭包仍包含部分执行 SDK。后续若要进一步缩小 Web 镜像，可按实际运行依赖拆分平台包。

## 目录与入口

```text
apps/web/              Next.js 页面、API、客户端与 UI
apps/worker/           执行、后台服务与运维入口
packages/contracts/    共享类型、校验、录制解析和平台协议
packages/engine/       编译器、模型适配、计划执行和平台驱动
packages/server/       业务、调度、证据与数据库访问
drizzle/               数据库迁移
tests/                 跨包检查与 UI 验证
tools/                 部署打包工具
docs/                  设计、操作指南与历史记录
```

后台入口共用 `apps/worker/src/serviceRuntime.ts`；Web 和 worker 的独立产物由 `tools/package-deployment.mjs` 组装。服务组合和启动命令见 [部署指南](deployment.md#默认服务组合)，依赖版本约定见 [开发指南](development.md#依赖版本)，检查归属见 [测试指南](testing.md#默认检查)。

后端按业务组织：`runs` 管理提交、状态和执行记录；`execution` 装配引擎、平台运行时和录制采集；`scheduling` 管理资源与租约。`execution` 依赖业务模块，业务查询与提交不反向依赖执行器。外部连接和技术实现放入 `infrastructure`，HTTP 响应工具放入 `http`。

worker 的常驻进程入口放在 `src/processes`，一次性运维命令放在 `src/commands`。构建产物继续平铺在 `dist`，现有部署启动命令保持有效。

## 执行协议与引擎接口

`contracts/execution` 只保存跨应用共享的数据和校验：`plan.ts` 定义计划、节点和动作步骤，`compilation.ts` 定义编译请求，`target.ts` 定义执行目标，`platform.ts` 定义动作、断言、观察、能力和重放事件。这些数据被 API、数据库、录制与前端消费，因此不依赖引擎。Browserless 连接配置归入 `contracts/integrations/browserless.ts`。

模型调用接口 `ModelClient` 归入 `engine/llm/contracts.ts`；会话、规划器、评估器和运行器选项归入 `engine/platform/contracts.ts`，由引擎实现和服务端执行装配使用。Web 录制定位使用的 `RecordedAction` 就近定义在 `engine/platform/web/recordingLocator.ts`。contracts 不导入或重新导出这些内部接口。

## 数据库表定义

`packages/server/src/db/schema/` 按业务拆分表定义，包含认证、团队、用例、套件、执行记录、调度资源、构建、实时事件、问题、集成和插件。`db/schema.ts` 统一导出全部表，业务代码和 Drizzle 配置继续使用该入口。schema 文件之间直接导入所属业务文件，不从统一入口回引；执行记录、录制版本及模型调用等相互关联的表集中在 `schema/runs.ts`，避免循环依赖。数据库迁移仍在根目录 `drizzle/`。
