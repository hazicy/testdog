# 基础组件

使用 [Base UI](https://base-ui.com/react/overview/quick-start) 提供无头交互，在 `src/app/globals.css` 中沿用 CaseForge 的颜色、边框、尺寸和焦点样式。

- `Button`、`Input`：保留 Base UI 属性，默认使用 `ws-button`、`ws-input`，可用 `className` 定制。
- `Checkbox`：用 `checked` 和 `onCheckedChange` 控制状态，配合外层 `label` 提供名称。
- `Select`：用 `value`、`onValueChange` 和 `items` 控制选择；选项支持 `disabled`，组件支持 `required`、`name` 和 `aria-label`。弹出列表通过 Portal 渲染。数值选项统一转成字符串，调用方按需转换。
- `Dialog`：由挂载控制打开状态，`onDismiss` 处理 Escape；`busy` 时阻止关闭。`titleId` 指向可见标题，`initialFocus` 可指定初始焦点；关闭后恢复触发元素焦点，元素被删除时回到主内容。共享目录中的 `Dialog` 保留兼容导出。
- `Tabs`：使用 Base UI 的 `Root`、`List`、`Tab`、`Panel`，由组件管理键盘导航和关联关系。

应用根节点设置 `isolation: isolate`，弹窗和下拉列表拥有独立的层级。回放时间轴使用 Base UI Slider；多行文本、链接、表格保留原生 HTML；代码编辑器继续使用 CodeMirror。

颜色统一在 `src/app/globals.css` 的 `:root` 中定义语义化 CSS 变量，`@theme inline` 将其映射为 Tailwind 工具类。页面和组件使用 `bg-surface`、`text-page-muted`、`border-page-line`、`text-brand` 等 token；CSS、SVG 和 CodeMirror 样式使用 `var(--surface)`、`var(--brand)` 等变量。新增颜色先定义 token，避免在组件中写十六进制颜色或使用 Tailwind 默认色板。品牌交互状态使用 `--brand-hover`、`--brand-soft`、`--brand-line` 等独立 token，调整主题时一并维护。
