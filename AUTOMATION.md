# Playwright 流程录制与重放

安装浏览器：`pnpm exec playwright install chromium`。默认有头运行，显示浏览器窗口；设置 `AUTOMATION_HEADLESS=true` 可切换为无头模式。

首次探索：`POST /api/cases`

```json
{"mode":"record","url":"https://www.bilibili.com/","case":"搜索极客湾，进入搜索结果中的第一个视频"}
```

步骤执行结束后保存流程，响应返回 `flowId`。默认不生成验收断言；只有用例明确要求“断言/验证某条件”才产生 assert 步骤。探索需要 `OPENAI_API_KEY`（沿用现有 DeepSeek 接口配置）。

录制先把用例拆成固定的原子动作列表，然后逐项结合 DOM 定位执行。完成最后一项立即结束，不再调用模型决定是否重新开始。独立 url 参数只在开始执行一次并保存为导航步骤。复杂操作需要拆成明确的点击/填写动作。若当前页面还无法执行计划中的动作（例如仍是 about:blank 或需要先打开面板），模型可先插入一个前置导航/点击/按键步骤，执行后再重新规划同一项；每项最多允许 3 个前置步骤，超出即停止。

再次执行：`POST /api/cases`

```json
{"mode":"replay","flowId":"首次返回的 UUID"}
```

重放不调用模型，不需要模型密钥。每步使用保存的定位、输入、页面切换与断言。失败立即停止，不自动改写流程或重复提交。`GET /api/cases` 列出已保存流程。

流程存放于 `.automation/flows/<flowId>.json`，可在版本控制之外备份或迁移。当前 final 为 null，仅 assert 步骤执行断言；旧流程附带的自动 expected/final 不再执行。只适合当前单机服务；部署到临时文件系统时需要换成数据库或持久卷。输入值也会保存，请勿录制密码或令牌。

定位优先使用 role/name、label、placeholder、testId，必要时使用有区域限定的 CSS。唯一性默认严格检查；只有明确的“第几个”场景使用 index。视频列表第一项应保存结果区域中的链接序号，不绑定当次视频标题。

当前支持主文档与新标签页，不包含跨 iframe 定位、参数化输入或自动修复。模型生成的定位和断言仍需要运行验证；站点结构改变后可重新录制生成新流程。

显式断言支持 `mode: unique`（唯一元素可见）、`any`（任一匹配可见）、`count`（至少 minCount 个匹配可见）、`value`（唯一输入框值等于 inputValue），同时校验 URL。动作定位保持严格唯一，不自动取第一个。DOM 仅用于规划下一步，操作完成不等于业务验收通过。

运行测试：`pnpm test`。测试使用拦截的本地 HTML，无需模型密钥或访问外部站点。
