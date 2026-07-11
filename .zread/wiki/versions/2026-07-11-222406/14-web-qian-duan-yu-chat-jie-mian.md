本页聚焦 `apps/web`：一个基于 Next.js App Router 的 Web 前端应用，承载项目首页、可交互的 Agent Chat 控制台以及由 ZRead 生成的项目文档站。页面范围严格限定在浏览器端渲染、路由组合、与 API 的 SSE 流式对接，以及可复用的文档渲染逻辑；不涉及后端 Agent Runtime、队列或 Toolbox 实现。

Sources: [AGENTS.md](apps/web/AGENTS.md#L1-L43), [package.json](apps/web/package.json#L1-L33)

## 技术栈与模块定位

`apps/web` 采用 Next.js 16 + React 19 + Tailwind CSS 4 构建界面，使用 monorepo 共享包完成类型复用与 API 调用：

| 依赖 | 来源 | 作用 |
|------|------|------|
| `next` / `react` / `react-dom` | npm | 应用框架与 UI 运行时 |
| `tailwindcss` | npm | 原子化样式 |
| `@phosphor-icons/react` | npm | 图标 |
| `@agent-template/ui` | workspace | 共享 shadcn/ui Button 等基础组件 |
| `@agent-template/shared` | workspace | Agent Run、Event、Conversation 等共享类型与 Zod Schema |
| `@agent-template/agent-client` | workspace | 创建服务端/客户端 Agent Platform Client |
| `react-markdown` / `remark-gfm` | npm | Markdown 渲染 |

Sources: [package.json](apps/web/package.json#L6-L33)

## 页面与路由结构

App Router 的入口文件与职责如下：

| 路由 | 文件 | 类型 | 说明 |
|------|------|------|------|
| `/` | `app/page.tsx` | Server Component | 项目首页，展示 API / DB / Queue 健康状态 |
| `/agent` | `app/agent/page.tsx` | Server Component | 嵌入 `AgentConsole` Chat 控制台 |
| `/docs`、 `/docs/[...slug]` | `app/docs/[[...slug]]/page.tsx` | Server Component | 静态生成 ZRead 项目文档 |
| `/api/agent/chat` | `app/api/agent/chat/route.ts` | Route Handler | 接收浏览器 POST，向上游 Agent API 发起 SSE 对话 |
| `/api/agent/runs/[runId]` | `app/api/agent/runs/[runId]/route.ts` | Route Handler | 代理取消指定 Agent run |

Sources: [app/page.tsx](apps/web/app/page.tsx#L1-L94), [app/agent/page.tsx](apps/web/app/agent/page.tsx#L1-L6), [app/docs/[[...slug]]/page.tsx](apps/web/app/docs/[[...slug]]/page.tsx#L1-L176), [app/api/agent/chat/route.ts](apps/web/app/api/agent/chat/route.ts#L1-L118), [app/api/agent/runs/[runId]/route.ts](apps/web/app/api/agent/runs/[runId]/route.ts#L1-L22)

## Chat 界面数据流

Chat 控制台采用“浏览器 → Next.js Route Handler → Agent API → Runtime” 的链式流式架构。浏览器通过 `EventSource` 语义消费 SSE；服务端 Route Handler 负责认证、会话创建与流转发，从而避免浏览器直接暴露 API Token 或 Runtime 细节。

```mermaid
flowchart LR
    A[Browser<br/>AgentConsole] -->|POST /api/agent/chat<br/>SSE response| B[Next.js Route Handler<br/>app/api/agent/chat/route.ts]
    B -->|createAgentPlatformClient| C[Agent API<br/>/v1/agent/conversations/{id}/runs]
    C --> D[Agent Runtime<br/>Claude / Eve]
    D -->|SSE frames| C
    C -->|run-accepted / agent-event / result| B
    B -->|SSE events| A
```

Sources: [agent-console.tsx](apps/web/src/features/frontend-agent/agent-console.tsx#L1-L513), [agent-client.ts](apps/web/src/lib/agent-client.ts#L1-L253), [chat/route.ts](apps/web/app/api/agent/chat/route.ts#L1-L118)

## AgentConsole：Chat 状态机

`AgentConsole` 是 `app/agent/page.tsx` 的唯一客户端组件，封装了 Agent 运行状态机。其状态类型 `AgentConsoleStatus` 包括 `idle`、`submitting`、`running`、`waiting`、`completed`、`cancelled`、`skipped`、`failed` 八种。核心逻辑由 `executeRun` 驱动：它先校验 prompt，随后调用 `streamAgentChat` 打开 SSE 流；在回调中分别处理 `run-accepted`（记录 `runId` 与 `conversationId`）、`agent-event`（追加事件历史并更新文本）、`result`（写入最终状态）。

界面布局为左右双栏：左侧是 `ArtifactWorkspace`（展示当前 Agent 输出/Artifact），底部是输入框；右侧是 `AgentRunTimeline`（运行事件时间线与输入请求）。`busy` 变量由 `status === "submitting" || status === "running" || responding` 决定，用于禁用输入框并显示取消按钮。取消时通过 `cancelAgentRun` 调用 `/api/agent/runs/{runId}`，同时中止本地 AbortController。

Sources: [agent-console.tsx](apps/web/src/features/frontend-agent/agent-console.tsx#L23-L186), [agent-console.tsx](apps/web/src/features/frontend-agent/agent-console.tsx#L401-L513)

## AgentRunTimeline：运行事件与输入确认

`AgentRunTimeline` 将 `AgentRunEvent` 数组转换为 `Activity` 时间线。`buildActivities` 从事件流中提取 `tool-call` / `tool-result`，按 `callId` 匹配完成状态；若存在 `done` / `error` / `cancelled` 终端事件，则追加相应节点。

当运行中出现 `input-request` 事件时，组件会在时间线底部渲染 `InputRequestGroup`。每个 `InputRequestCard` 支持两种交互模式：
1. 选项按钮：当 `request.options` 存在时，渲染单选或确认按钮，单请求直接提交，多请求收集后批量提交。
2. 自由输入：当 `request.allowFreeform` 为真且没有选项时，提供文本框与提交按钮。

响应结果通过 `handleRespond` 再次进入 `executeRun`，并把已回答的 `requestId` 记入 `answeredRequestIds`，避免同一请求重复渲染。

Sources: [agent-run-timeline.tsx](apps/web/src/features/frontend-agent/agent-run-timeline.tsx#L1-L359), [agent-console.tsx](apps/web/src/features/frontend-agent/agent-console.tsx#L160-L180)

## 浏览器端 SSE 解析

`streamAgentChat`（`src/lib/agent-client.ts`）是浏览器与 Chat 接口打交道的唯一函数。它向 `/api/agent/chat` 发送 POST，读取 `response.body` 并使用 `TextDecoder` 累积字符缓冲，再调用 `readSseMessages` 按 `\n\n` 拆分 SSE 消息。解析后的消息类型有：

| SSE event | 业务含义 | 消费端处理 |
|-----------|----------|------------|
| `run-accepted` | Agent run 已被接受 | `onAccepted` 设置 `runId` / `conversationId` |
| `agent-event` | 中间运行事件 | `onEvent` 更新事件历史、流式文本 |
| `result` | 最终运行结果 | 返回 `AgentRunResult` |
| `error` | 流式错误 | 抛出异常 |

`parseSseMessage` 对 `data:` 字段做 JSON 解析，并使用 `AgentRunEventSchema`、`AgentRunResultSchema` 等共享 Zod Schema 校验，确保前后端类型一致。

Sources: [agent-client.ts](apps/web/src/lib/agent-client.ts#L49-L253), [agent-run.ts](packages/shared/src/agent-run.ts#L1-L136), [agent-run-events.ts](packages/shared/src/agent-run-events.ts#L1-L82)

## 事件历史与 Artifact 管理

`event-history.ts` 提供 `appendAgentEventHistory`，用于在浏览器端维持有界事件列表。默认上限 `maxAgentEventHistory = 500`。它对连续的 `text` 事件做合并（仅保留最新完整文本），并在超出上限时优先保留最近的 `artifacts` 事件，避免运行结果在滚动中被截断。

`AgentConsole` 中的 `buildArtifactTabs` 从事件流中提取 `kind === "artifacts"` 的 `tabs` 数组；如果没有 Artifact，则把当前流式输出兜底为“分析报告”标签页。`ArtifactWorkspace` 支持标签切换与复制到剪贴板。

Sources: [event-history.ts](apps/web/src/features/frontend-agent/event-history.ts#L1-L37), [event-history.test.ts](apps/web/src/features/frontend-agent/event-history.test.ts#L1-L58), [agent-console.tsx](apps/web/src/features/frontend-agent/agent-console.tsx#L300-L400)

## 服务端 Route Handler 与认证

`app/api/agent/chat/route.ts` 是 Chat 接口的“网关”：
- 校验请求体为 `AgentRunInputSchema`；
- 根据 `conversationId` 复用已有会话，否则创建新会话；
- 使用 `AGENT_API_URL` / `AGENT_TEMPLATE_TOKEN`（优先于 `NEXT_PUBLIC_API_BASE_URL` / `AGENT_API_TOKEN`）创建 `createAgentPlatformClient`；
- 将上游 SSE 转发为浏览器端兼容的 `text/event-stream` 响应，并设置 `Cache-Control: no-cache`、`X-Accel-Buffering: no`。

`app/api/agent/runs/[runId]/route.ts` 仅实现 `DELETE` 方法，代理取消请求到上游 `client.runs.cancel(runId)`。

Sources: [chat/route.ts](apps/web/app/api/agent/chat/route.ts#L1-L118), [runs/[runId]/route.ts](apps/web/app/api/agent/runs/[runId]/route.ts#L1-L22), [agent-client/src/index.ts](packages/agent-client/src/index.ts#L1-L427)

## 文档站：/docs

`/docs` 路由消费 `.zread/wiki/current` 指向版本目录中的 `wiki.json` 与 Markdown 文件。`findZReadWikiRoot` 按环境变量 `ZREAD_WIKI_ROOT`、当前工作目录及上级目录搜索 `.zread/wiki/current`。`listZReadDocuments` 与 `readZReadDocument` 读取 manifest 并校验文件路径，避免路径遍历。`DocsMarkdown` 通过 `react-markdown` 渲染正文，并支持相对 `.md` 链接的 slug 解析。

文档目录在构建时通过 `generateStaticParams` 静态导出，首文档默认映射到 `/docs`。

Sources: [zread-root.ts](apps/web/src/lib/zread-root.ts#L1-L38), [zread-catalog.ts](apps/web/src/lib/zread-catalog.ts#L1-L120), [docs-markdown.tsx](apps/web/src/features/docs/docs-markdown.tsx#L1-L120), [docs/[[...slug]]/page.tsx](apps/web/app/docs/[[...slug]]/page.tsx#L1-L176)

## 样式与无障碍

全局样式在 `app/globals.css` 中定义，以 CSS 变量形成 Agent 控制台主题：`--agent-canvas`（#f0f0f0）、`--agent-paper`、`--agent-ink`、`--agent-accent`（#ff4017）等。`agent-action` 类统一过渡与点击缩放；`agent-activity-item` 提供入场动画，并在 `prefers-reduced-motion: reduce` 下关闭。

输入框使用 `aria-label` 与 `sr-only` 标签，错误状态通过 `aria-live="polite"` 播报；状态徽章、Artifact 导航与输入请求按钮均具备可见焦点环。

Sources: [globals.css](apps/web/app/globals.css#L1-L82), [agent-console.tsx](apps/web/src/features/frontend-agent/agent-console.tsx#L1-L513)

## 环境变量与配置

Web 运行所需的关键变量如下：

| 变量 | 用途 | 默认值/示例 |
|------|------|-------------|
| `NEXT_PUBLIC_API_BASE_URL` | 浏览器直接访问的 API 基地址 | `http://localhost:14000` |
| `AGENT_API_URL` | 服务端 Route Handler 访问上游 API 的地址 | `http://localhost:14000` |
| `AGENT_TEMPLATE_TOKEN` | 服务端访问上游 API 的 Bearer Token | 空 |
| `AGENT_API_TOKEN` | 兼容旧变量，优先级低于 `AGENT_TEMPLATE_TOKEN` | 空 |
| `ZREAD_WIKI_ROOT` | 自定义 ZRead wiki 根目录 | 空 |

`next.config.ts` 固定 `experimental.cpus: 2` 并关闭基于内存的 worker 计数，避免本地开发及 Codex Desktop 环境出现编译进程负载尖峰；`transpilePackages` 包含三个 workspace 共享包。

Sources: [next.config.ts](apps/web/next.config.ts#L1-L16), [.env.example](.env.example#L1-L38), [AGENTS.md](apps/web/AGENTS.md#L30-L36)

## 测试与质量验证

`apps/web` 使用 Vitest 进行单元测试，覆盖以下模块：

| 模块 | 测试文件 | 验证重点 |
|------|----------|----------|
| `agent-client.ts` | `src/lib/agent-client.test.ts` | SSE 解析、错误分类、取消与提交参数 |
| `event-history.ts` | `src/features/frontend-agent/event-history.test.ts` | 文本合并、历史边界、Artifact 保留 |
| `stack.ts` | `src/lib/stack.test.ts` | 技术栈常量 |
| `zread-catalog.ts` | `src/lib/zread-catalog.test.ts` | 文档目录解析 |
| `zread-links.ts` | `src/lib/zread-links.test.ts` | 相对链接 slug 解析 |

验证命令：

```bash
pnpm --filter @agent-template/web lint
pnpm --filter @agent-template/web test
pnpm --filter @agent-template/web typecheck
pnpm --filter @agent-template/web build
```

本地开发固定使用 webpack 模式（`pnpm --filter @agent-template/web dev`），在 Turbopack 原生 worker 相关问题解决前不会切换。

Sources: [package.json](apps/web/package.json#L6-L11), [AGENTS.md](apps/web/AGENTS.md#L37-L43), [agent-client.test.ts](apps/web/src/lib/agent-client.test.ts#L1-L80)

## 下一步阅读

- 若需理解 Agent API 与 SSE 流的后端实现，继续阅读 [API 路由、SSE 与任务队列](13-api-lu-you-sse-yu-ren-wu-dui-lie)。
- 若需了解 Agent Runtime 如何产生 Chat 中的事件流，阅读 [Claude Agent Runtime 适配](9-claude-agent-runtime-gua-pei) 与 [Eve Agent Runtime 适配](10-eve-agent-runtime-gua-pei)。
- 若需了解项目文档如何生成，阅读 [ZRead 项目 Wiki 生成](18-zread-xiang-mu-wiki-sheng-cheng)。
- 若需了解共享包与数据库模型，阅读 [数据库模型与持久化边界](12-shu-ju-ku-mo-xing-yu-chi-jiu-hua-bian-jie)。