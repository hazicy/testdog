# Playwright + LLM + Jev DOM Agent

可独立运行的实验模块，尚未接入 Testdog 的已有计划运行器或 Web UI。沿用仓库 Node.js 24+、pnpm 和 TypeScript 环境，无新增依赖。

```sh
pnpm install
pnpm --filter @testdog/automation exec playwright install chromium
pnpm dom-agent
# 可选：显示浏览器
pnpm dom-agent --headed
```

演示在随机本地端口启动页面，完成输入、重复按钮的行上下文选择及最终验证后退出。Planner 和 Choice 使用固定 fixture，不调用外部 API；这验证执行链路，不代表模型准确率。

## 真实模型运行

CLI 从项目根目录依次读取 `.env.local`、`.env`；已导出的 shell 环境变量优先。也可以将下列配置写入 `.env.local`（去掉 `export`），不要覆盖已有项目配置。缺少必填项时会一次列出所有变量。端点、模型名及 API Key 必须替换为实际服务配置。

```sh
export DOM_AGENT_LLM_ENDPOINT='https://your-provider.example/v1/chat/completions'
export DOM_AGENT_LLM_KEY='...'
export DOM_AGENT_LLM_MODEL='your-model'
export JEV_API_KEY='...'
export DOM_AGENT_URL='https://github.com/example/repo'
export DOM_AGENT_TASK='打开 Issues，筛选 Bug'
export DOM_AGENT_ALLOWED_ORIGINS='https://github.com'
export DOM_AGENT_ALLOWED_TARGETS='["click:link:Issues","click:button:Labels","click:checkbox:bug"]'
pnpm dom-agent --live
```

示例目标名称需要按实际页面调整。CLI 对元素操作采用调用方维护的 `action:role:name` 白名单；未列出的操作直接拒绝，不由模型推测权限。真实业务应通过 `authorize` 按具体任务、账号、订单及动作校验，删除、支付、发送等在该回调中接入既有审批。不要在未知网页上使用 `authorize: async () => true`。

默认 Jev 端点为 `https://api.typesafe.ai/v1/systemone`，模型固定 `jev-1.14.0`；可用 `JEV_ENDPOINT` 和 `JEV_MODEL` 覆盖。官方 [模型文档](https://docs.typesafe.ai/models) 使用此版本 ID；原方案中的 `typesafe/jev-1.14` 并非该直连接口记录的 ID。[Choice 文档](https://docs.typesafe.ai/primitives/choice) 确认最多 255 个选项，返回 choice、probabilities、confidence。当前模块保留最多 200 个元素和四个特殊选项，默认 Top-K 80；0.65 阈值仅为实验配置。没有真实 API 凭据的测试不验证服务可用性、延迟或质量。

## 调用方式与职责

从 `@testdog/automation/domAgent/index` 导入 `runDOMAgent`、`createChatPlanner`、`createJevChooser`。传入已打开 HTTP(S) 页面的 Playwright `Page`、任务及 `AgentOptions`；调用方持有浏览器的创建和关闭责任。建议使用独立 BrowserContext，并禁用 service worker。LLM 接口使用兼容 Chat Completions 的 HTTP JSON 请求，供应商须支持 `response_format: json_object`。

| 模块         | 职责                                                                             |
| ------------ | -------------------------------------------------------------------------------- |
| `types.ts`   | Zod 计划约束，动作、目标及验证条件                                               |
| `dom.ts`     | 标签、ARIA、属性及最近语义容器；开放 Shadow DOM 和附加 frame；节点 ID 注册与释放 |
| `recall.ts`  | 动作兼容性过滤，文本、上下文、role、链接、视口评分；排序后 Top-K                 |
| `clients.ts` | 低频多步 LLM 计划与 Jev Choice HTTP 客户端；超时、响应校验、置信度拒选           |
| `agent.ts`   | 唯一精确匹配直达；歧义交给 Choice；执行、轮询验证、恢复及权限回调                |
| `cli.ts`     | 本地演示和真实模型入口                                                           |

没有把输入值、密码或整个页面正文送给模型；候选文本和容器上下文分别限制长度。DOM 中自身呈现的敏感文本仍可能被提取，调用方须按数据策略处理。

### 执行和验证

支持 click、fill、select（原生 select）、check、hover、navigate、scroll、wait。自定义 combobox 应拆为点击打开、点击选项。每步必须带验证条件，支持 URL 子串、可交互目标可见性、输入值、checked、精确可见文本。wait 等待条件成立；不以固定延迟当作成功。

候选 ID 对应提取时的真实 ElementHandle，而非重新匹配的 CSS 或 nth 下标，页面重排不会把 ID 指向另一节点。执行前复查可见性与 enabled，Playwright 再执行动作可操作性检查。唯一匹配检查在全部候选中进行，避免截断后误认为唯一。所有 handle 在每次快照使用结束后释放。

每步默认最多三次局部尝试：重新提取和召回；none/低置信度拒选；need_scroll 经权限校验后向下滚动；wait 短暂等待；need_replan 直接升级。每次循环均有预算，默认最多 60 次动作、两次重规划、120 秒总取消信号，HTTP 30 秒超时。Playwright 在途调用有独立超时，取消不是瞬时中断浏览器动作。

一旦动作已派发，执行超时或后置条件失败都视为结果不确定，复查条件后交给 LLM 恢复，不进行局部重放。完全相同的未对账动作禁止再次执行；语义改写无法仅靠字符串识别，外部写操作仍需要业务幂等键、状态核对及 host policy。首次计划的 completion 条件固定保存，重规划不能降低成功标准。

`onEvent` 提供 selected（含 locator/choice）、verified、retry、uncertain、replan 事件；结果包含动作数、重规划数和历史，便于区分召回与决策故障。事件可能包含页面文本，接入日志时按业务要求处理。

### 边界

这是可运行基线，不承诺生产成功率。名称提取覆盖常见 ARIA/label/placeholder，不是完整 W3C accessible-name 算法；闭合 Shadow DOM、伪元素、复杂图标命名、虚拟列表定位、滚动容器和新标签页切换尚未支持。滚动恢复只滚动当前主页面；跨 frame 候选支持附加 frame，动态脱离会进入局部恢复。验证码交给重规划后受预算限制退出。

allowedOrigins 对执行前 URL、显式导航及浏览器 HTTP 导航请求进行校验，禁止跳转到未授权来源；它不是网络隔离沙箱，页面脚本请求、同源副作用、service worker 以及浏览器会话权限需由宿主控制。页面内容明确作为不可信数据传给模型，权限只由 host callback 提供；提示词本身不保证完全抵御注入。

## 验证

```sh
pnpm test packages/automation/src/domAgent/agent.test.ts
pnpm --filter @testdog/automation typecheck
```

测试使用 Chromium 和本地拦截页面，覆盖 500 个重复候选中的上下文召回、动作过滤、Jev 请求与响应、跨 frame/Shadow DOM、确定性旁路、拒选局部恢复、权限拒绝及验证失败不重复执行。真实 Jev/LLM 准确率、Recall@K、任务完成率、延迟和费用需另建标注页面集评估；本地 fixture 不产生这些指标。
