# 开发指南

本地启动见 [快速开始](../README.md#快速开始)，代码与依赖方向见 [Monorepo 结构](monorepo.md)，配置及迁移操作见 [部署指南](deployment.md)，提交前检查和按需验证见 [测试指南](testing.md)。

## 依赖版本

第三方依赖版本统一维护在 `pnpm-workspace.yaml` 的 `catalog` 中。各应用和包通过 `catalog:` 声明自身依赖，仓库内依赖使用 `workspace:*`。根 `package.json` 只声明仓库工具、配置及根测试直接使用的依赖。

升级时修改 catalog，运行 `pnpm install` 并提交锁文件；新增依赖应在使用它的包中声明。测试依赖放在对应包的 `devDependencies`，不要靠根目录或其他包的依赖提供。

## 数据库结构修改

表定义位于 `packages/server/src/db/schema.ts`，Drizzle 配置与迁移位于仓库根目录。

```bash
pnpm db:generate
```

检查生成 SQL 的数据保留、回填和版本兼容行为，运行隔离迁移测试，再随代码提交。已有迁移不重写；对目标数据库应用迁移及更新写入者的顺序统一见 [数据库迁移与升级](deployment.md#数据库迁移与升级)。

## 功能与素材

前端功能目录约定见 [功能目录](../apps/web/src/features/README.md)，组件约定见 [UI 组件](../apps/web/src/components/ui/README.md)，后端边界见 [服务端结构](../packages/server/src/README.md)。

品牌素材在 `apps/web/public/brand`，缺省页插画在 `apps/web/public/illustrations`，浏览器图标在 `apps/web/src/app/icon.svg`。当前使用暖陶土橙侧脸猎犬标识，验证勾融入垂耳；[素材预览](../apps/web/public/brand/preview.html) 也可通过 `/brand/preview.html` 访问。
