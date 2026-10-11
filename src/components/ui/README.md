# 基础组件

使用 [Base UI](https://base-ui.com/react/overview/quick-start) 提供无头交互，主题颜色在 `src/app/globals.css` 中定义，组件的边框、尺寸和状态样式使用 Tailwind，并通过 `tailwind-merge` 合并调用方的定制。

- `Button`：默认 `variant="outline"`、`size="md"`。通过 `variant` 选择 `outline`、`primary`、`soft`、`ghost` 或 `danger`；通过 `size` 选择 `md`、`sm`、`xs` 或 `icon`、`icon-sm`、`icon-xs`。内部通过 Tailwind 类组合边框、颜色、尺寸、悬停、禁用和焦点样式，颜色使用已有主题变量。`className` 通过 `tailwind-merge` 与基础样式合并，主要用于布局。
- `soft`：使用主题浅色背景和品牌文字，适合工具栏中需要突出但保持轻量的核心操作。
- 图标按钮使用 `<Button variant="ghost" size="icon" aria-label="关闭">…</Button>`；主要操作使用 `variant="primary"`。保留 Base UI 的 `ref`、`render` 和其他属性，支持函数形式的 `className`。
- 链接及第三方交互组件使用 `buttonStyles({ variant, size, className })` 复用按钮外观，并保留各自的原生语义。业务调用不再手写 `ws-button`、`primary`、`ghost` 等样式类。
- `Input`：保留 Base UI 属性和函数形式的 `className`；基础样式由 `inputStyles` 统一提供，传入 `pl-9`、`w-auto` 等工具类即可覆盖默认值。`Textarea` 复用同一套字段样式。
- `Label`：统一字段标题和控件间距；`Table`：基于 Base UI `useRender` 封装原生表格，配合 `TableHeader`、`TableBody`、`TableRow`、`TableHead`、`TableCell`、`TableCaption` 使用，支持 `render`、`ref` 和 Tailwind 覆盖；`statusStyles`：统一状态文字和圆点样式。
- `Checkbox`：用 `checked` 和 `onCheckedChange` 控制状态，配合外层 `label` 提供名称。
- `Select`：用 `value`、`onValueChange` 和 `items` 控制选择；选项支持 `disabled`，组件支持 `required`、`name` 和 `aria-label`。弹出列表通过 Portal 渲染。数值选项统一转成字符串，调用方按需转换。
- `Dialog`：配合 `DialogHeader`、`DialogFooter` 统一布局，宽度可以通过 `className="max-w-md"` 等工具类定制。由挂载控制打开状态，`onDismiss` 处理 Escape；`busy` 时阻止关闭。`titleId` 指向可见标题，`initialFocus` 可指定初始焦点；关闭后恢复触发元素焦点，元素被删除时回到主内容。
- `Tabs`：使用 Base UI 的 `Root`、`List`、`Tab`、`Panel`，由组件管理键盘导航和关联关系。

应用根节点设置 `isolation: isolate`，弹窗和下拉列表拥有独立的层级。回放时间轴使用 Base UI Slider；多行文本、链接、表格保留原生 HTML；代码编辑器继续使用 CodeMirror。

颜色统一在 `src/app/globals.css` 的 `:root` 中定义语义化 CSS 变量，`@theme inline` 将其映射为 Tailwind 工具类。页面和组件使用 `bg-surface`、`text-page-muted`、`border-page-line`、`text-brand` 等 token；CSS、SVG 和 CodeMirror 样式使用 `var(--surface)`、`var(--brand)` 等变量。新增颜色先定义 token，避免在组件中写十六进制颜色或使用 Tailwind 默认色板。品牌交互状态使用 `--brand-hover`、`--brand-soft`、`--brand-line` 等独立 token，调整主题时一并维护。

图标直接使用 `@iconify/react/offline` 的 `Icon`，在调用文件中按需导入 `@iconify-icons/lucide` 图标数据并传给 `icon` 属性；尺寸和语义颜色由调用方设置，装饰性图标添加 `aria-hidden="true"`。动作类型到图标数据的映射由 `features/runs/lib/actionIcon.ts` 提供，时间轴与步骤列表共用。

全局 CSS 只保留主题变量、Tailwind token 和基础/无障碍规则，基础规则放在 `@layer base`。ReactFlow 的第三方选择器、节点交互和响应式样式放在 `features/runs/components/plan-board.css`；编辑器的浮层与动画放在 `features/test-cases/components/test-editor.css`，分别由所属组件引入。页面定制通过 `data-slot="input"`、`data-slot="select"`、`data-slot="status"` 和 `data-status` 选择组件，避免依赖旧的展示类名。
