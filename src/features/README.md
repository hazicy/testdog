# 功能目录

每个功能包含自己的 `components/`、`hooks/`、`types.ts`、`schemas.ts` 和 `lib/`，按实际需要创建。测试与被测模块就近存放。

- `marketing`：首页演示与动效。
- `test-cases`：用例类型、请求校验、编辑、删除和平台矩阵运行配置。
- `workspace`：组合用例与执行记录列表、筛选、统计和弹窗，管理列表数据的实时刷新。
- `runs`：执行类型、请求校验、实时更新协议、录制脚本解析、回放索引、计划布局，以及对应界面。

`src/app` 负责路由入口；`src/components` 保留跨功能复用的基础 UI、应用外壳和共享组件。功能可以通过明确的组件路径组合其他功能，但共享组件不依赖业务功能。

`types.ts`、`schemas.ts` 和 `lib/` 中的领域代码不依赖 UI、数据库或服务端运行时，可以由前后端共用；组件和 hooks 通过 API 调用后端。通用请求、SSE 和轮询机制在 `src/client`；API 与 worker 共用的后端业务在 `src/server`，包括调用平台实现的重放适配。ESLint 禁止功能目录直接导入数据库、服务端运行时或模型实现。

`features/workspace` 只负责列表与统计的界面组合，领域类型分别属于 `test-cases` 和 `runs`。数据库迁移测试在 `src/db`，真实执行测试的 fixture 在 `src/server/runs/fixtures`。

运行详情的播放状态仍由页面实例持有，通过 `useRunPlayback` 集中更新；数据订阅由 `useRunData` 管理。计划画板和录制编辑器保持动态加载，录制编辑器在首次打开后保留挂载，以保留未保存的草稿。
