# 浏览器服务提供方

Web 执行调用 `openRunBrowser`，不依赖任何具体远程服务。默认使用本地浏览器，启用的远程服务仅接管其 `supportedBrowsers`；Browserless 当前接管 Chromium，WebKit 继续使用本地。远程连接失败会使执行失败，不自动回退。

## 接入新的服务（如 BrowserStack）

1. 在 `packages/automation/src/platform/web/providers` 实现 `BrowserProvider`：声明 ID、支持的浏览器，连接后返回 `BrowserConnection`。连接需要有超时，取消后返回的会话必须关闭；连接错误不得携带地址或凭据。`close()` 负责提供方特有的会话释放，并须幂等。`artifacts` 声明支持的证据类型，执行层据此启用视频和 trace。
2. 在本目录注册 `BrowserProviderDefinition`：提供名称、描述、输入校验及旧凭据合并逻辑、解密后校验和不包含敏感信息的状态。新增提供方不需要修改执行层、数据库表或通用 API。
3. 在 `apps/web/src/features/integrations/components/browserProviderForms.ts` 注册配置表单。表单调用 `PUT /api/integrations/browser-providers/{provider}` 保存，并调用同路径 `/test` 测试已保存配置。输入必须含 `version`、`enabled`；其他字段由该提供方定义。保存返回 `{ integration }`，列表为 `GET /api/integrations` 的 `browserProviders`。
4. 添加配置隔离、连接失败、取消清理、证据归档和 UI 测试。目前只实现本地和 Browserless 适配器，BrowserStack 是后续扩展对象。

配置表按用户及 provider 唯一，启用新服务会停用该用户原先启用的服务。版本冲突返回 409；数据库约束确保每个用户最多启用一个远程提供方。匿名本地配置单独隔离。执行开始时从数据库读取运行记录的归属，加载当前配置，执行期间不切换提供方。

## Browserless

迁移数据库后，在集成页填写 `ws://` 或 `wss://` 的 `/chromium/playwright` 端点，以及可选 Token。原生协议服务需兼容项目的 Playwright 1.63.0。地址中的 `token` 参数会提取为独立凭据；显式 Token 优先，清除操作会同时清除地址中的 Token。地址和凭据均加密存储且不回显，留空保留已保存值。

API 和 worker 使用相同的 `CASEFORGE_INTEGRATION_SECRET`（未设置时使用 `BETTER_AUTH_SECRET`，至少 32 字符）。复用现有集成加密格式，并以用户和 provider 绑定密文，不改变通知配置格式。

连接测试创建独立页面并在结束时释放会话；不访问用例网站。原生远程执行的视频通过 `video.saveAs()` 下载归档，截图、日志、实时预览及 trace 沿用现有流程。含敏感输入的执行仍禁止视频和 trace。
