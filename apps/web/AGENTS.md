# apps/web 协作指南

## 职责

`apps/web` 是 Next.js 前端应用，负责用户界面、页面组合、浏览器端交互和调用 API 的展示逻辑。

## 能力边界

- 使用 App Router，页面入口在 `app/`。
- 共享 UI 组件从 `@agent-template/ui` 引入。
- 共享类型和响应 schema 从 `@agent-template/shared` 引入。
- 浏览器通过同源 `/api/agent/chat` 调用 Next.js Route Handler；Route Handler 只使用服务端 `AGENT_API_URL` 和 `AGENT_TEMPLATE_TOKEN` 访问 Agent API，不回退 `NEXT_PUBLIC_*`。
- Web、CLI 和 Web QA 共用 `@agent-template/agent-client` 的 v1 `frame`/`error` stream Interface；Web gateway 只注入服务端凭据并保持该协议，不再维护私有 SSE 事件协议。

## 不应该做

- 不在这里实现通用 Button、cn、schema 或服务端队列逻辑。
- 不直接连接 PostgreSQL、Redis 或 BullMQ。
- 不把业务常量散落在页面里；可复用内容放到 `src/lib/` 或共享 package。

## UI 规则

- 用户可见文案默认中文。
- shadcn/ui 相关改动优先使用 `shadcn` Skill。
- Markdown 继续由 `react-markdown` 与 `remark-gfm` 解析，元素排版统一使用共享的 shadcn/typeset 样式；Agent/Docs preset 由 `app/globals.css` 维护，renderer 只保留链接、锚点和共享 UI primitive 映射。
- UI、样式、交互、动效、无障碍和前端性能任务在编辑前先运行 `pnpm ui:skills start`，再按路由结果运行 `pnpm ui:skills list --category <category>` 和 `pnpm ui:skills get <owner/skill>`。
- 普通任务动态加载 1 个 UI Skill；广泛审查、重设计或多界面任务最多加载 3 个。不把动态 Skill 安装进项目。
- 本文件、项目既有技术栈和组件模式优先于动态 UI Skill；未经要求不得迁移框架、组件库或动画库。
- 前端 Agent 体验可参考 `https://github.com/shadcn-labs/agentcn` 的 Agent preview、运行事件和 artifact tabs；不要从这里导入 Eve/Flue recipe 或后端 runtime 逻辑。
- 当前 Web 只消费 shared Agent run events 和最终结果，不直接连接 MCP Server，也不代理 `tools/call`。
- `/docs` 只消费根目录 `.zread/wiki/current` 指向版本的原生 `wiki.json` 及 manifest 明确列出的 Markdown；目录顺序、标题、分组和 slug 以 ZRead 原生产物为准，不扫描或猜测生成目录结构。
- 只从当前 manifest 闭合的 Markdown 页面提取源码引用并静态生成 `/docs/source/*`，范围链接定位到起始行；未列入 manifest 的 Markdown 不得扩大 allowlist，禁止依赖远端代码托管地址或开放任意仓库文件读取。
- Mermaid fenced code 使用浏览器端按需加载和 strict security level 渲染；普通 fenced code 保持 shadcn/typeset 源码展示，渲染失败必须显示原始图表文本。
- 交互式 Tool UI 尚未选定新方案；不得恢复已删除的 Host bridge、MCP App iframe 或 JSON Render 路径，新增前先记录 ADR。

## 验证

- 本地 `dev` 和 Web `build` 固定使用 Next.js webpack 模式；在确认 Turbopack 原生 worker 的 macOS/Codex Desktop 负载问题解决前，不移除 `--webpack`。
- Next.js 编译 worker 固定为 2，避免开发机和 Codex Desktop 验证期间出现 CPU/进程负载尖峰。

```bash
pnpm --filter @agent-template/web lint
pnpm --filter @agent-template/web test
pnpm --filter @agent-template/web typecheck
pnpm --filter @agent-template/web build
```
