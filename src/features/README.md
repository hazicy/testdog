# 功能目录

每个功能包含自己的 `components/`、`hooks/`、`types.ts`、`schemas.ts` 和 `lib/`，按实际需要创建。测试与被测模块就近存放。

- `marketing`：首页演示与动效。
- `test-cases`：用例类型、请求校验、编辑、删除和平台矩阵运行配置。
- `workspace`：组合用例与执行记录列表、筛选、统计和弹窗，管理列表数据的实时刷新。
- `runs`：执行类型、请求校验、实时更新协议、录制脚本解析、回放索引、计划布局，以及对应界面。

`src/app` 负责路由入口；`src/components` 保留跨功能复用的基础 UI、应用外壳和共享组件。功能可以通过明确的组件路径组合其他功能，但共享组件不依赖业务功能。

`types.ts`、`schemas.ts` 和 `lib/` 中的领域代码不依赖 UI、数据库或服务端运行时，可以由前后端共用；组件和 hooks 通过 API 调用后端。通用请求、SSE 和 SWR 重试策略在 `src/client`；API 与 worker 共用的后端业务在 `src/server`，包括调用平台实现的重放适配。ESLint 禁止功能目录直接导入数据库、服务端运行时或模型实现。

`features/workspace` 只负责列表与统计的界面组合，领域类型分别属于 `test-cases` 和 `runs`。数据库迁移测试在 `src/db`，真实执行测试的 fixture 在 `src/server/runs/fixtures`。

运行详情的播放状态仍由页面实例持有，通过 `useRunPlayback` 集中更新；数据订阅由 `useRunData` 管理。计划画板和录制编辑器保持动态加载，录制编辑器在首次打开后保留挂载，以保留未保存的草稿。

工作区列表和执行详情通过 SWR 管理 API 数据、缓存、请求去重与刷新，SWR 的 `fetchJson` 和业务请求共用 `ky.create()` 创建的 `api` 实例。业务代码使用 `api.get/post/patch/delete`、`json` 选项和 `.json<T>()`，错误提示统一由 `beforeError` Hook 处理，保留 ky 原生错误类型；ETag 条件读取单独位于 `src/client/etag.ts`。ky 关闭自动重试，由 SWR 管理读取重试；写入操作不会自动重复发送。请求与响应体读取共用 15 秒总超时，保留取消请求和统一错误提示。列表 SSE 通知触发缓存重新获取；详情 SSE 快照与增量直接更新同一份缓存，按执行版本防止旧 HTTP 响应覆盖新数据。SSE 连接正常时暂停自动读取，断线后恢复可见页面的轮询；已结束或不存在的执行详情仅在挂载和手动刷新时读取。执行详情的 HTTP 读取保留 ETag 缓存。
