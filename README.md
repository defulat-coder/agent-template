# Agent Template

一个基于 pnpm Workspace 和 Turborepo 的 TypeScript 项目模板，包含 Next.js 前端、Fastify API、BullMQ Worker、Prisma/PostgreSQL、Redis、MCP Toolbox、Claude Agent SDK、Zod、Pino 和 Vitest。

## 技术栈

- 前端：pnpm + TypeScript + Next.js + React + Tailwind CSS + shadcn/ui + Vitest
- 后端：TypeScript + Fastify + Prisma + PostgreSQL + Redis + BullMQ + MCP Toolbox + Claude Agent SDK + Eve + Zod + Pino + Vitest
- 工程化：pnpm Workspace + Turborepo

## 快速开始

```bash
cp .env.example .env
pnpm install
# 确认 PostgreSQL :15432 与 Redis :16379 已在本机监听
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Docker Compose 是显式选择的容器启动方式，不是默认构建或回归验证路径。

默认服务：

- Web: http://localhost:13000
- Eve Agent: http://localhost:13010
- API: http://localhost:14000
- Health: http://localhost:14000/health
- PostgreSQL: localhost:15432
- Redis: localhost:16379
- MCP Toolbox: http://localhost:15000

## 常用命令

```bash
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm db:verify:boundaries
pnpm db:verify:fixture:empty
pnpm db:verify:migrations:empty
pnpm agent-runs:verify:local
pnpm agent-runtime:verify:local
pnpm agent-runtime:check:bundle
```

## 目录结构

```text
apps/
  web/       Next.js + React + Tailwind CSS
  api/       Fastify HTTP API
  worker/    BullMQ 后台任务进程
  toolbox/   MCP Toolbox tools.yaml
packages/
  ui/            shadcn/ui 风格共享组件
  db/            Prisma schema 和 Prisma Client
  ecommerce-fixture/ 独立 schema 的合成零售验证数据
  logger/        Pino logger 封装
  agent/         Agent runtime 公共边界
  agent-claude/  Claude Agent SDK runtime
  agent-eve/     Eve runtime
  toolbox-config/ Toolbox 共享配置与能力 Profile
  shared/        共享 Zod schema 和 TypeScript 类型
```

`apps/toolbox/tools.yaml` 定义生产 Agent 可加载的数据库工具。默认 toolset 是 `agent_template_read_model`：保留 `public.TemplateEvent` 的只读运行观测，同时提供 `ecommerce_fixture` 中合成电商的日销售、渠道、区域、客户分群、品类、商品排行、订单详情和履约异常查询。`pnpm db:seed` 会分别 seed 平台与独立 fixture；`pnpm db:verify:boundaries` 验证业务表没有泄漏回 `public`。指标口径和 MCP annotations 见 [Toolbox 业务语义契约](apps/toolbox/SEMANTIC_LAYER.md)，智能问数的术语到字段/取值映射见 [智能问数落地](apps/toolbox/INTELLIGENT_QUERY.md)，完整的参数、索引和 MCP 验证命令见 [apps/toolbox/README.md](apps/toolbox/README.md)。prebuilt generic tools 仅用于开发期探索，不作为生产 Agent 默认能力。

Claude 与 Eve 分别通过各自框架的原生 MCP Client 直连 Toolbox：Claude 使用 SDK HTTP MCP server，Eve 使用 `agent/connections/toolbox.ts`。两者共用 `TOOLBOX_URL`、`TOOLBOX_AUTH_TOKEN` 和 `AGENT_CAPABILITY_PROFILE`，但不共享 client lifecycle，也不经过 API 代理。

Kimi Code 通过 Anthropic-compatible 协议接入两套 Agent runtime：

```bash
ANTHROPIC_API_KEY=<your-kimi-api-key>
ANTHROPIC_BASE_URL=https://api.kimi.com/coding/
ANTHROPIC_MODEL=kimi-for-coding
CLAUDE_AGENT_MODEL=kimi-for-coding
EVE_AGENT_MODEL=kimi-for-coding
EVE_AGENT_HOST=http://localhost:13010
CLAUDE_CODE_AUTO_COMPACT_WINDOW=262144
```

`AGENT_RUNTIME=claude|eve` 只通过环境变量选择。未配置 API Key 时，API 仍可启动；`/health` 分别显示当前 runtime 的 `configured` 与 `readiness`。生产检查只探测所选 runtime，设置短超时且不会向模型发送 prompt。

API 与 Worker 不静态加载两套 runtime。公共 selector 根据部署环境动态加载 Claude 或 Eve adapter；构建门禁保证两者位于独立 chunk，未选择的框架不会在进程启动时初始化。

Chat SSE 与 queued job 共用持久化 Agent run lifecycle。`POST /agent/jobs` 返回的 `id` 即 `runId`；通过 `GET /agent/runs/:runId` 查询状态，通过 `DELETE /agent/runs/:runId` 请求取消。PostgreSQL 保存 ordered events 和 terminal result，BullMQ 只负责投递同一个 `runId`。
