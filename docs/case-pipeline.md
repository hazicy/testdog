# 用例输入到执行

文本输入和画板编辑共用结构化计划；保存与试跑共用可执行校验；Web、Android 和 iOS 共用编排器。平台差异留在目标配置和 session adapter 中，业务层不依赖浏览器或设备 SDK 对象。

| 阶段       | 约束                                                                                                           | 实现和验收证据                                                                                                                                                                                                                                  |
| ---------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 输入       | 目标决定平台和启动地址；公共输入可被执行目标覆盖；密钥只保存引用                                               | `@testdog/contracts/automation/platform/target`、`@testdog/contracts/automation/platform/inputs`；`runs/repository.test.ts` 覆盖地址归一化、缺失输入、跨平台覆盖与冻结，`workspace/queries.test.ts` 和 `issues/repository.test.ts` 覆盖历史数据 |
| 转换       | 请求包含描述、当前计划和平台上下文；响应必须可执行，校验失败有一次修正机会                                     | `@testdog/contracts/automation/compiler/request`、`textCompiler.ts`；`textCompiler.unit.test.ts` 覆盖结构、条件、上下文和修正，编译 API 测试覆盖权限、错误和取消                                                                                |
| 编辑       | 生成内容先审核；接受、拒绝和撤销保留依赖及原步骤；失败和取消保留草稿，旧响应不能覆盖新请求                     | `lib/planReview.ts`、`hooks/usePlanCompilation.ts`；`lib/planReview.test.ts`、`tests/ui/plan-board.e2e.ts`、`tests/ui/workspace.e2e.ts` 覆盖逐项审核、中文输入、撤销、草稿恢复及取消后重试                                                      |
| 保存和试跑 | 草稿允许空分组；可执行计划必须连接到入口、有任务、无循环或条件路径逃逸；纯验证任务必须有预期；试跑不保存用例   | `@testdog/contracts/automation/compiler/schema`、`@testdog/contracts/test-cases/schemas`；`executionPlan.test.ts`、用例 API 测试和 UI 草稿试跑测试                                                                                              |
| 提交和执行 | 提交冻结计划和目标；执行前解析普通输入，保留不透明密钥引用；已保存计划不重复编译；租约限制设备占用和写入权限   | `runs/submission.ts`、`runs/run.ts`、`PlanRunner`、调度模块；repository、scheduler、planRunner 测试及 `runs/run.test.ts` 真实 Chromium 工作流                                                                                                   |
| 重放       | 冻结动作、计划和环境；重放不重新规划；来源变化或删除不改变已提交快照；环境不兼容或操作缺失明确失败             | `replayEnvironmentSnapshot`、`recordingSteps`；repository、runtime、recordings 测试及真实 Chromium 来源删除、popup、编辑录制和断言重放测试                                                                                                      |
| 结束和结果 | 取消、失败码、证据完整性和未结束步骤原子保存；保留主要错误并脱敏；归档和资源清理分别有界，未确认关闭的设备隔离 | `finishRun`、`runAbort.ts`、`finalizeRuntime.ts`；repository、runtime、finalizeRuntime、原生 session/diagnostics 测试及 Chromium 取消、归档失败测试                                                                                             |

上表中 automation 路径相对于 `packages/automation/src`，服务端路径相对于 `packages/server/src`，编辑逻辑相对于 `apps/web/src/features/test-cases`。接口与兼容细节见 [工作台文档](workspace.md)。

验证命令及默认/按需测试的启用条件统一见 [测试指南](testing.md)，数据库升级见 [部署指南](deployment.md#数据库迁移与升级)。

## 历史验收记录

以下为 2026-10-12 该批工作的历史结果，不代表当前测试数量或设备验收状态。该批原生收尾改动使用 SDK 合同测试，不等同于最新代码的真机验收；未操作生产数据库。

2026-10-12 完成验收：全量代码测试 419 通过、12 按配置跳过；最终生产构建的 UI 回归 63 通过。类型检查、ESLint、格式与 diff 检查通过。历史目标地址、断开步骤、来源删除后的重放、生成取消和日志标签切换均有回归证据；无待完成的默认验收项。
