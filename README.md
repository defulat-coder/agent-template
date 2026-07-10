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
docker compose up -d
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

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
  logger/        Pino logger 封装
  agent/         Agent runtime 公共边界
  agent-claude/  Cloud/Claude Agent SDK runtime
  agent-eve/     Eve runtime
  shared/        共享 Zod schema 和 TypeScript 类型
```

`apps/toolbox/tools.yaml` 定义生产 Agent 可加载的数据库工具。默认 toolset 是 `agent_template_read_model`：保留 `TemplateEvent` 的只读运行观测，同时提供合成电商的日销售、渠道、商品排行、订单详情和履约异常查询。`pnpm db:seed` 会写入 96 个脱敏客户、24 个商品和 600 个确定性订单；指标口径和 MCP annotations 见 [Toolbox 业务语义契约](apps/toolbox/SEMANTIC_LAYER.md)，完整的参数、索引和 MCP 验证命令见 [apps/toolbox/README.md](apps/toolbox/README.md)。prebuilt generic tools 仅用于开发期探索，不作为生产 Agent 默认能力。

`mcp-host.config.json` 通过 `servers` registry 定义 MCP Host 要连接的 server；默认 `toolbox` server 使用 `TOOLBOX_URL` 和 `TOOLBOX_TOOLSET` 占位，修改后重启 API/Agent 服务即可生效，不需要改 Cloud 或 Eve runtime 代码。

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

`AGENT_RUNTIME=claude|eve` 只通过环境变量选择。未配置 API Key 时，API 仍可启动，`/health` 会显示当前 runtime 配置状态。
