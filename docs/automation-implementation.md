# 多平台架构实施记录

历史状态：本文保存首期多平台实现及当时的验收证据，测试数量、SDK 能力与“未操作生产数据库”等结论仅适用于该批工作，不表示当前代码或部署环境的状态。首期范围见 [架构设计](automation-architecture.md)；当前操作统一见 [部署指南](deployment.md) 和 [测试指南](testing.md)。

| 范围       | 实现与证据                                                                                                                                                                                                              |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 共享编排   | 严格版本化 session/action/observation/capability 契约、PlanRunner DAG/分支/预算、平台 factory 与 evidence sink；Web 和原生重放均采用冻结 IR。Web popup、取消、分支、编辑和附件回归通过                                  |
| 移动 Web   | Pixel 7/Chromium 与 iPhone 13/WebKit 的真实 viewport/UA/scale/touch 验证通过；旧 desktop 配置保留                                                                                                                       |
| 原生       | agent-device 0.21.24、命名会话、明确设备 ID、唯一稳定 locator、revision、结构化与只读语义断言。Android emulator 和 iOS simulator 自建应用完成安装、输入、点击、等待、断言、截图与共享重放；最后边界修复后双平台复测通过 |
| 构建       | APK/.app 身份与摘要、实际安装摘要、初始化策略、OS/driver/build/profile 检查。Android 三种策略与 iOS 安装/清数据实测通过，篡改与不兼容合同测试通过                                                                       |
| 调度       | 持久化队列、独立并发 worker、行锁、心跳、fencing、阶段 deadline、隔离和显式恢复。隔离 PostgreSQL 18 多连接领取、过期写入拒绝和真实 Android SDK 健康恢复共 3 项通过                                                      |
| 证据与故障 | before/after/final 截图/快照、完整性标记、归档错误保留主要错误、条件诊断、清理不明确时隔离。SDK 部分启动失败、模型失败、取消、归档失败与录制器停止不明测试；Android 真实 MP4/应用日志采集通过                           |
| 工作台     | 平台、资源、构建、重置、deep link、原生 JSON/结构化断言编辑、诊断与完整性提示。生产构建的 Chromium UI 验收通过，API 使用隔离 fixture                                                                                    |
| 存储和授权 | 私有本地/S3 附件、归属校验、Range、生产认证默认开启、请求头脱敏。S3 协议 fixture Put/Get/Delete 与归属测试、认证和密钥测试通过                                                                                          |
| 迁移       | expand/backfill/cutover、历史 legacy desktop/录制/附件保留、旧未完成执行安全终结。隔离迁移与 PostgreSQL 全迁移通过，未操作生产数据库                                                                                    |

当时最终全量默认测试 133 通过、8 跳过；随后新增的设备命令失败后 refs 失效测试与原生会话回归共 8 项通过。独立 PostgreSQL 与真实 Android 恢复 3 项通过；生产 UI 1 项通过；最后共享 Web 回归 9 项通过。最后 Android/iOS 实测 2 项通过，耗时 210.68 秒。TypeScript、ESLint、格式、diff 检查与生产构建通过。

当时 Android SDK 提供视频和应用日志，不提供普通 device trace；显式请求不支持的附件会失败。原生 trace 使用独立 producer/format，不能当作 Playwright Trace 打开。真机属于按需范围，签名、授权和后端能力未实测。

## 当前操作入口

重新验证请使用 [测试指南](testing.md)，部署及升级切换请使用 [部署指南](deployment.md#数据库迁移与升级)。本文不再维护命令副本。
