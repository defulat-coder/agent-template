# apps/web 协作指南

## 职责

`apps/web` 是 Next.js 前端应用，负责用户界面、页面组合、浏览器端交互和调用 API 的展示逻辑。

## 能力边界

- 使用 App Router，页面入口在 `app/`。
- 共享 UI 组件从 `@agent-template/ui` 引入。
- 共享类型和响应 schema 从 `@agent-template/shared` 引入。
- 浏览器通过同源 `/api/agent/chat` 调用 Next.js Route Handler；Route Handler 使用服务端 `AGENT_API_URL` 和 `AGENT_TEMPLATE_TOKEN` 访问 Agent API。

## 不应该做

- 不在这里实现通用 Button、cn、schema 或服务端队列逻辑。
- 不直接连接 PostgreSQL、Redis 或 BullMQ。
- 不把业务常量散落在页面里；可复用内容放到 `src/lib/` 或共享 package。

## UI 规则

- 用户可见文案默认中文。
- shadcn/ui 相关改动优先使用 `shadcn` Skill。
- UI、样式、交互、动效、无障碍和前端性能任务在编辑前先运行 `pnpm ui:skills start`，再按路由结果运行 `pnpm ui:skills list --category <category>` 和 `pnpm ui:skills get <owner/skill>`。
- 普通任务动态加载 1 个 UI Skill；广泛审查、重设计或多界面任务最多加载 3 个。不把动态 Skill 安装进项目。
- 本文件、项目既有技术栈和组件模式优先于动态 UI Skill；未经要求不得迁移框架、组件库或动画库。
- 前端 Agent 体验可参考 `https://github.com/shadcn-labs/agentcn` 的 Agent preview、运行事件和 artifact tabs；不要从这里导入 Eve/Flue recipe 或后端 runtime 逻辑。
- 当前 Web 只消费 shared Agent run events 和最终结果，不直接连接 MCP Server，也不代理 `tools/call`。
- 交互式 Tool UI 尚未选定新方案；不得恢复已删除的 Host bridge、MCP App iframe 或 JSON Render 路径，新增前先记录 ADR。

## 验证

```bash
pnpm --filter @agent-template/web lint
pnpm --filter @agent-template/web test
pnpm --filter @agent-template/web typecheck
pnpm --filter @agent-template/web build
```
