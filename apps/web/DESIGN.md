# Agent Template Web 设计系统

## 定位

`apps/web` 是 Agent 平台模板的产品界面，不是营销站点。界面服务于项目状态检查、Agent 工作流、工程文档和源码浏览。

## 设计原则

- 以 shadcn/ui `new-york` 风格和 `neutral` 主题为唯一视觉基础。
- 优先组合 `@agent-template/ui` 中由 shadcn CLI 维护的 primitives，不重复实现 Button、Card、Badge、Tabs、Alert、Empty、Field、Table、ToggleGroup 等通用界面模式。
- 页面 `className` 主要负责布局与响应式排列；颜色、圆角、阴影、交互状态和表单状态由 shadcn 组件及其 variants 提供。
- 只使用 `background`、`foreground`、`primary`、`muted`、`border`、`destructive` 等语义化 token，不增加页面专属颜色变量或硬编码色值。
- 保留产品所需的信息层级和中文文案，不为追求独特视觉增加渐变、光效、额外动画或自定义字体。

## 组件使用

| 场景         | 首选组件                       |
| ------------ | ------------------------------ |
| 操作与导航   | `Button`                       |
| 状态与短标签 | `Badge`                        |
| 信息分组     | `Card`                         |
| 错误反馈     | `Alert`                        |
| 空内容       | `Empty`                        |
| 表单         | `Field` + `Input` / `Textarea` |
| 输入内操作   | `InputGroup`                   |
| 少量选项     | `ToggleGroup`                  |
| 多份交付物   | `Tabs`                         |
| 活动列表     | `Item`                         |
| 表格内容     | `Table`                        |
| 层级路径     | `Breadcrumb`                   |
| 可折叠内容   | `Collapsible`                  |

Markdown 解析继续由 `react-markdown` 与 `remark-gfm` 负责；渲染后的 HTML 统一使用共享的 shadcn/typeset 样式，并按 Agent 与 Docs 两种阅读场景选择 `app/globals.css` 中对应的 preset。链接、分隔线和表格保留项目语义，尽量复用共享 UI primitives 与语义化 token，不再逐元素重复维护排版节奏。

## 响应式与无障碍

- 页面最小高度使用动态视口单位。
- 标题使用 `text-balance`，正文使用 `text-pretty`，数据使用 `tabular-nums`。
- 图标按钮必须提供中文 `aria-label`。
- 错误出现在触发操作附近；表单控件同步设置 `data-invalid` 与 `aria-invalid`。
- 交互控件使用 shadcn/Radix 的键盘与焦点行为，不在页面中手写焦点管理。
