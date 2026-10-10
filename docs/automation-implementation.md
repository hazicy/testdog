# 多平台架构实施记录

已实现 [多平台自动化架构](automation-architecture.md) 的首期范围，完成当前代码、迁移与真实浏览器/模拟设备验收。生产部署与按需真机接入需在对应环境执行。

| 范围       | 实现与证据                                                                                                                                                                                                              |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 共享编排   | 严格版本化 session/action/observation/capability 契约、PlanRunner DAG/分支/预算、平台 factory 与 evidence sink；Web 和原生重放均采用冻结 IR。Web popup、取消、分支、编辑和附件回归通过                                  |
| 移动 Web   | Pixel 7/Chromium 与 iPhone 13/WebKit 的真实 viewport/UA/scale/touch 验证通过；旧 desktop 配置保留                                                                                                                       |
| 原生       | agent-device 0.21.24、命名会话、明确设备 ID、唯一稳定 locator、revision、结构化与只读语义断言。Android emulator 和 iOS simulator 自建应用完成安装、输入、点击、等待、断言、截图与共享重放；最后边界修复后双平台复测通过 |
| 构建       | APK/.app 身份与摘要、实际安装摘要、初始化策略、OS/driver/build/profile 检查。Android 三种策略与 iOS 安装/清数据实测通过，篡改与不兼容合同测试通过                                                                       |
| 调度       | 持久化队列、独立并发 worker、行锁、心跳、fencing、阶段 deadline、隔离和显式恢复。隔离 PostgreSQL 18 多连接领取、过期写入拒绝和真实 Android SDK 健康恢复共 3 项通过                                                      |
| 证据与故障 | before/after/final 截图/快照、完整性标记、归档错误保留主要错误、条件诊断、清理不明确时隔离。SDK 部分启动失败、模型失败、取消、归档失败与录制器停止不明测试；Android 真实 MP4/应用日志采集通过                           |
| 工作台     | 平台、资源、构建、重置、deep link、输入引用、原生 JSON/结构化断言编辑、矩阵、诊断与完整性提示。生产构建的 Chromium UI 验收通过，API 使用隔离 fixture                                                                    |
| 存储和授权 | 私有本地/S3 附件、归属校验、Range、生产认证默认开启、secret 引用与脱敏。S3 协议 fixture Put/Get/Delete 与归属测试、认证和密钥测试通过                                                                                   |
| 迁移       | expand/backfill/cutover、历史 legacy desktop/录制/附件保留、旧未完成执行安全终结。隔离迁移与 PostgreSQL 全迁移通过，未操作生产数据库                                                                                    |

最终全量默认测试 133 通过、8 跳过；随后新增的设备命令失败后 refs 失效测试与原生会话回归共 8 项通过。独立 PostgreSQL 与真实 Android 恢复 3 项通过；生产 UI 1 项通过；最后共享 Web 回归 9 项通过。最后 Android/iOS 实测 2 项通过，耗时 210.68 秒。TypeScript、ESLint、格式、diff 检查与生产构建通过。

本次 Android SDK 提供视频和应用日志，不提供普通 device trace；显式请求不支持的附件会失败。原生 trace 使用独立 producer/format，不能当作 Playwright Trace 打开。真机属于按需范围，签名、授权和后端能力未实测。

## 可重复验证

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm format:check
pnpm build
RUN_DEVICE_LIVE_TESTS=true CASEFORGE_ANDROID_SERIAL=emulator-5580 ANDROID_SDK_ROOT=/path/to/sdk pnpm exec vitest run src/automation/platform/native/agentDevice.live.test.ts
CASEFORGE_TEST_DATABASE_URL=postgresql://user@127.0.0.1:5432/caseforge_test_scheduler pnpm exec vitest run src/server/scheduling/scheduler.postgres.test.ts
CASEFORGE_UI_URL=http://127.0.0.1:3015 pnpm exec vitest run src/features/workspace/workspace.live.test.ts
```

PostgreSQL 测试只接受本地、名称以 caseforge_test_ 开头的数据库，使用独立临时 schema 并清理，不读取 DATABASE_URL。同时设置 CASEFORGE_ANDROID_SERIAL 可验证原生健康恢复，设备必须专用于测试。

## 部署切换

先停止旧 API 接收执行，等待或停止旧后台执行进程，再运行 pnpm db:migrate、部署新 API 并启动 pnpm worker。cutover 迁移终结旧租约缺失的未完成任务，不能代替停止旧进程。历史录制与附件保持原值。设备 worker 需要对应 SDK/Xcode 与明确资源配置；跨主机附件使用私有 S3，应用构建在 worker 主机登记或放置于共享构建目录。
