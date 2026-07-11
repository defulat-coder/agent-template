# packages/ui 协作指南

## 职责

`packages/ui` 提供共享 React UI 组件和样式工具，当前包含 shadcn/ui 风格的 `Button` 和 `cn`。

## 能力边界

- 只放跨页面、跨应用复用的 UI primitives。
- 组件应保持无业务语义，不依赖 API、数据库、队列或环境变量。
- 样式优先使用 Tailwind utility 和语义化组件变体。

## 不应该做

- 不放页面级布局。
- 不放业务文案。
- 不依赖 `apps/web`。

## 设计规则

- shadcn/ui 组件和组合模式使用 `shadcn` Skill。
- UI、样式、交互、动效、无障碍和前端性能任务在编辑前先运行 `pnpm ui:skills start`，再按路由结果运行 `pnpm ui:skills list --category <category>` 和 `pnpm ui:skills get <owner/skill>`。
- 普通任务动态加载 1 个 UI Skill；广泛审查、重设计或多界面任务最多加载 3 个。不把动态 Skill 安装进项目。
- 本文件、项目既有技术栈和组件模式优先于动态 UI Skill；未经要求不得迁移框架、组件库或动画库。

## 验证

```bash
pnpm --filter @agent-template/ui lint
pnpm --filter @agent-template/ui test
pnpm --filter @agent-template/ui typecheck
pnpm --filter @agent-template/ui build
```
