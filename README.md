# testdog

基于 Next.js、PostgreSQL、Redis、Playwright 和 DeepSeek 的自然语言测试工作台。编写用例、录制执行、查看逐步证据，并按记录重放操作。支持移动 Web、Android 与 iOS。

## 快速开始

使用 Node.js 22.13+ 和 pnpm 12.10.1。在仓库根目录运行：

```bash
pnpm install
cp .env.example .env
docker compose up -d
```

按 [环境配置](docs/deployment.md#环境配置) 设置数据库、模型和认证密钥，再按 [数据库迁移](docs/deployment.md#数据库迁移与升级) 初始化数据库。然后安装本地浏览器并启动：

```bash
pnpm exec playwright install chromium webkit
pnpm dev
# 另一个终端
pnpm worker
```

打开 http://localhost:3000，在 `/register` 注册或 `/login` 登录。默认 worker 已包含维护、通知和 outbox；独立运行与分离部署统一见部署指南。

## 文档导航

| 需要了解或执行                                                         | 权威文档                                                                             |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 环境变量、认证、存储、服务组合、生产部署、迁移、资源恢复与历史数据认领 | [配置、部署与运维](docs/deployment.md)                                               |
| 依赖版本、数据库结构修改、开发目录与品牌素材                           | [开发指南](docs/development.md)                                                      |
| 提交前检查、UI 回归、真实模型、Redis、PostgreSQL 和设备验证            | [测试与验证](docs/testing.md)                                                        |
| 应用、共享包与依赖方向                                                 | [Monorepo 结构](docs/monorepo.md)                                                    |
| 用例、执行、录制、证据、实时协议与 API                                 | [工作台数据模型与 API](docs/workspace.md)                                            |
| 用例输入、编译、试跑与执行链路                                         | [用例输入到执行](docs/case-pipeline.md)                                              |
| 问题追踪与回归验证                                                     | [问题文档](docs/issues.md)                                                           |
| 登录身份与缓存                                                         | [登录身份文档](docs/login-identities.md)                                             |
| 飞书、Email 和通知投递语义                                             | [通知文档](docs/notifications.md)                                                    |
| Browserless 与新浏览器服务接入                                         | [浏览器提供方](packages/server/src/browser-providers/README.md)                      |
| 多平台架构决策与内部契约                                               | [自动化架构](docs/automation-architecture.md)                                        |
| 首期实施和数据库检查的历史证据                                         | [实施记录](docs/automation-implementation.md)、[数据库检查](docs/database-review.md) |

操作说明以对应权威文档为准；实施记录保存当时的范围和验收结果，不作为当前部署或配置指南。
