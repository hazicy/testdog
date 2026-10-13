# 基础组件

使用 [Base UI](https://base-ui.com/react/overview/quick-start) 提供交互行为，外观由 CSS Modules 和原生 CSS 嵌套实现。组件类名描述元素职责，如 `trigger`、`popup`、`field`、`footer`；交互状态通过 `data-*`、`aria-*` 和伪类表达。

- `Button`：默认 `variant="outline"`、`size="md"`。变体包括 `outline`、`primary`、`soft`、`ghost`、`danger`，尺寸包括 `md`、`sm`、`xs`、`icon`、`icon-sm`、`icon-xs`。基础外观放在 `Button.module.css`。链接和第三方按钮通过 `buttonStyles({ variant, size, className })` 复用外观。
- `Input` 和 `Textarea`：通过 `inputStyles` 复用 `Input.module.css`，支持调用方传入模块类名；`Input` 保留函数形式的 `className`。
- `Label`：统一标题和字段间距；`Table`：基于 Base UI `useRender` 封装原生表格，支持 `render`、`ref` 和模块类名；`statusStyles`：统一状态文字和圆点。
- `Checkbox`：用 `checked` 和 `onCheckedChange` 控制状态，配合外层 `label` 提供名称。
- `Select`：使用 `value`、`onValueChange`、`items`，支持 `disabled`、`required`、`name` 和 `aria-label`。选项值统一转成字符串，弹出列表通过 Portal 渲染。
- `Dialog`：配合 `DialogHeader`、`DialogFooter` 使用。调用方通过自己的模块类名设置宽度。挂载时打开，`onDismiss` 处理关闭，`busy` 时阻止关闭。关闭后恢复触发元素焦点，元素被删除时回到主内容。
- `Tabs`：直接使用 Base UI 的 `Root`、`List`、`Tab`、`Panel`，由组件管理键盘导航和关联关系。

基础控件样式位于 `controls` 层，页面模块位于默认层，调用方可以直接覆盖默认样式，不依赖类名顺序。使用 `clsx` 拼接模块类名和按条件启用状态类，不解析或合并 CSS 属性。

```tsx
import styles from './Search.module.css';

<Input className={styles.searchInput} aria-label="搜索" />;
```

```css
.searchInput {
  padding-left: 36px;

  &:focus {
    border-color: var(--brand);
  }

  @media (max-width: 640px) {
    width: 100%;
  }
}
```

全局 CSS 只保留基础重置、无障碍规则、主题变量和层级声明。颜色统一定义在 `app/globals.css` 的 `:root` 中，组件使用 `var(--surface)`、`var(--brand)` 等语义变量。应用根节点设置 `isolation: isolate`，回放时间轴使用 Base UI Slider，代码编辑器使用 CodeMirror。

ReactFlow 和 Dockview 的第三方覆盖放在对应业务模块中，通过局部类名限定 `:global(...)` 的作用范围。页面可通过 `data-slot`、`data-status` 定制基础控件；浏览器测试使用角色、可访问名称和稳定的 `data-ui` 标记，不依赖 CSS Modules 生成的类名。

图标使用 `@iconify/react/offline`，调用方指定尺寸，装饰性图标添加 `aria-hidden="true"`。
