# 后端业务层

本目录由 Next.js API 路由和独立执行 worker 共用。业务代码按职责组织，测试与被测模块就近存放。

- `login-identities`：登录身份、加密状态缓存、刷新租约及执行前登录准备。
- `test-cases/repository.ts`：用例查询、保存和删除。
- `runs/submission.ts`：校验执行请求、冻结用例或重放快照，并在事务中入队。
- `runs/lifecycle.ts`：取消和终结执行，在完成事务中关联失败问题。
- `runs/repository.ts`：执行详情、步骤、事件、日志和附件的数据库读写。
- `runs/records.ts`：数据库行到公开执行数据的纯映射，供查询、提交和实时增量共用。
- `runs/run.ts`、`runtime.ts`：执行生命周期、平台运行时装配和取消控制。
- `runs/replay.ts`：将历史执行步骤转换为引擎使用的重放步骤，调用平台适配器。
- `runs/recordings.ts`：录制版本查询、解析校验和保存；其他录制与附件模块负责证据采集和归档。
- `issues/repository.ts`：问题查询、事务写入、执行证据快照与回归关联。
- `scheduling`：资源登记、任务领取、租约校验、续约和恢复。
- `realtime`：数据库事件发布、实时通知与画面预览；SSE HTTP 入口位于 Web 应用。
- `browser-providers`：浏览器服务注册、按用户隔离的配置和统一连接入口；目前支持本地浏览器与 Browserless。
- `shared`：业务错误、HTTP 响应、Redis 连接、模型选择、凭据加密和进程身份。
- `testing`：隔离的 PGlite 测试数据库辅助代码，不用于生产运行。

`apps/web/src/app/api` 负责请求解析、响应和调用业务模块；`apps/worker/src/worker.ts` 使用同一套执行与调度模块消费任务。数据库连接和表定义在 `packages/server/src/db`，自动化算法与平台驱动在 `packages/automation/src`，前后端共用的类型、校验和纯函数在 `packages/contracts/src/<功能>` 中。

浏览器组件、功能 hooks 和通用客户端代码不能直接导入本目录的运行时代码，边界由 ESLint 检查；共享类型从 `@testdog/contracts` 对应领域模块导入。后端代码使用普通模块，保留独立 worker 和测试直接运行的能力。

HTTP 路由必须调用 Web 应用中的 `requireUserId(request)`，并将返回的 `UserScope` 传入查询、修改、执行创建和实时订阅。`null` 仅代表显式本地免登录模式的无归属数据，不表示所有用户。`getRun` 等 worker 共用读取方法不传用户范围时仅供内部 worker 使用，HTTP 路由必须显式传递范围或先调用 `assertRunAccess`；新增接口同样遵守这一约定。

执行模块的依赖方向为：生命周期 → 问题业务 → 任务提交／证据读写 → 数据映射。证据仓库不调用问题业务或调度器；任务续约与超时回收直接调用 `scheduling`，列表统一调用 `workspace/queries.ts`。`tests/moduleGraph.test.ts` 检查生产模块的静态与动态运行时依赖，阻止循环依赖。

构建登记与数据库校验在 `builds/repository.ts`；原生适配器通过运行时注入构建查询函数，执行引擎不导入本包。共享 HTTP 错误使用标准 `Response`，本包不依赖 Next.js。

用例、执行和录制保存的输入校验统一在业务入口完成。执行 HTTP 提交使用 `runs/submission.ts` 的 `submitRun`，以规范化后的参数计算幂等指纹；内部调用继续使用 `createRun`。
