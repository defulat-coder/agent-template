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

Docker Compose 是显式选择的容器启动方式，不是默认构建或回归验证路径。启动前必须设置至少 16 位的 `AGENT_API_TOKEN`；Compose 会先运行一次 `pnpm db:deploy`，成功后才启动 Toolbox、API 和 Worker，Web 通过容器内地址和同一个 Token 访问 API。

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
pnpm deploy:check
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
  cli/       Incur 可安装命令行客户端
  worker/    BullMQ 后台任务进程
  toolbox/   MCP Toolbox tools.yaml
packages/
  ui/            shadcn/ui 风格共享组件
  db/            Prisma schema 和 Prisma Client
  ecommerce-fixture/ 独立 schema 的跨域合成零售运营数据
  logger/        Pino logger 封装
  agent/         Agent runtime 公共边界
  agent-client/  Web、CLI 与 Node 服务共用的 HTTP/SSE Client
  agent-claude/  Claude Agent SDK runtime
  agent-eve/     Eve runtime
  toolbox-config/ Toolbox Capability Pack、Profile 与连接配置
  shared/        共享 Zod schema 和 TypeScript 类型
```

`apps/toolbox/tools.yaml` 定义生产 Agent 可加载的数据库工具。`public` 只提供 Agent 平台观测；隔离的 `ecommerce_fixture` 提供可关联的合成电商、订单、财务、物流、库存采购和营销数据。业务能力按 Capability Pack 绑定 Toolset、生产 scope、语义目录与官方生成 Skill，部署只需选择 `AGENT_CAPABILITY_PROFILE`。`pnpm db:seed` 会分别 seed 平台与独立 fixture；`pnpm db:verify:boundaries` 验证业务表没有泄漏回 `public`。指标口径和 MCP annotations 见 [Toolbox 业务语义契约](apps/toolbox/SEMANTIC_LAYER.md)，智能问数的术语到字段/取值映射见 [智能问数落地](apps/toolbox/INTELLIGENT_QUERY.md)，完整的参数、索引和 MCP 验证命令见 [apps/toolbox/README.md](apps/toolbox/README.md)。prebuilt generic tools 仅用于开发期探索，不作为生产 Agent 默认能力。

Claude 与 Eve 分别通过各自框架的原生 MCP Client 直连 Toolbox：Claude 使用 SDK HTTP MCP server，Eve 使用 `agent/connections/toolbox.ts`。两者共用 `TOOLBOX_URL`、`TOOLBOX_AUTH_TOKEN` 和 `AGENT_CAPABILITY_PROFILE`；Profile 原子展开对应的 Tool 与 Skill，但两套 runtime 不共享 client lifecycle，也不经过 API 代理。

Kimi Code 通过 Anthropic-compatible 协议接入两套 Agent runtime：

```bash
ANTHROPIC_API_KEY=<your-kimi-api-key>
ANTHROPIC_BASE_URL=https://api.kimi.com/coding/
ANTHROPIC_MODEL=kimi-for-coding
CLAUDE_AGENT_MODEL=kimi-for-coding
EVE_AGENT_MODEL=kimi-for-coding
EVE_AGENT_HOST=http://localhost:13010
EVE_AGENT_SERVICE_TOKEN=<Docker 或非 loopback 服务调用 Token>
CLAUDE_CODE_AUTO_COMPACT_WINDOW=262144
```

未配置服务 Token 的非生产 loopback 调用可使用 Eve 官方 `localDev()`；生产环境会关闭该入口。使用 `AGENT_RUNTIME=eve` 的 Docker Compose 部署和其他非 loopback 服务调用必须显式配置 `EVE_AGENT_SERVICE_TOKEN`，且 Eve 端口只绑定宿主机 `127.0.0.1`。

`AGENT_RUNTIME=claude|eve` 只通过环境变量选择。未配置 API Key 时，API 仍可启动；`/health` 分别显示当前 runtime 的 `configured` 与 `readiness`。生产检查只探测所选 runtime，设置短超时且不会向模型发送 prompt。

API 与 Worker 不静态加载两套 runtime。公共 selector 根据部署环境动态加载 Claude 或 Eve adapter；构建门禁保证两者位于独立 chunk，未选择的框架不会在进程启动时初始化。

Chat SSE 与 queued job 共用持久化 Agent run lifecycle。`POST /agent/jobs` 返回的 `id` 即 `runId`；通过 `GET /agent/runs/:runId` 查询状态，通过 `DELETE /agent/runs/:runId` 请求取消。PostgreSQL 保存 ordered events 和 terminal result，BullMQ 只负责投递同一个 `runId`。

## Agent CLI

`apps/cli` 使用 Incur 提供可安装的 `agent-template` 命令。CLI 只调用版本化 Agent API，不加载 Fastify、Prisma、BullMQ 或具体 Agent runtime。

服务端配置：

```bash
AGENT_API_TOKEN=<至少 16 位的服务端 Token>
```

生产环境必须配置该 Token。CLI 或其他服务使用：

```bash
export AGENT_TEMPLATE_API_URL=https://agent.example.com
export AGENT_TEMPLATE_TOKEN=<Agent API Token>

agent-template doctor
agent-template chat "分析最近失败的订单"
agent-template conversations list
agent-template conversations send <conversation-id> "继续分析"
agent-template runs list --status running
agent-template runs watch <run-id> --format jsonl
agent-template runs cancel <run-id>
```

本地构建和打包：

```bash
pnpm --filter @agent-template/cli build
pnpm --filter @agent-template/cli pack
```

打包产物可直接交给其他服务安装：

```bash
npm install --global ./agent-template-cli-0.1.0.tgz
agent-template doctor
```

发布到组织私有 Registry 后，安装命令为 `npm install --global @agent-template/cli --registry <registry-url>`。

发布前将 `@agent-template/cli` 替换为组织拥有的 npm scope，并发布到组织的私有 Registry。CLI bundle 已包含内部 `agent-client` 与 shared schemas，安装方只需要 Node.js 22 或更高版本。

版本化接口位于 `/v1/agent/*`。Agent conversation 是平台拥有的多轮会话；Runtime session ID 和 Eve continuation token 只作为服务端 continuation state 保存，不会暴露给 CLI。

旧版 `/agent/*` 路由只在开发和测试环境默认开启；生产环境默认关闭。如迁移期仍需保留，显式设置 `AGENT_LEGACY_ROUTES_ENABLED=true`，并由网关负责访问控制。
