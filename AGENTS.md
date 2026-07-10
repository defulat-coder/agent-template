# 项目协作指南

## 项目定位

TypeScript Agent 平台模板：`apps/` 放运行进程，`packages/` 放可复用能力。

核心栈：Next.js、Fastify、Prisma/PostgreSQL、Redis、BullMQ、MCP Toolbox、Claude Agent SDK、Eve、Zod、Pino、Vitest。

## 通用规则

- 用户可见文案默认中文；技术名词保留英文。
- 依赖版本锁住大版本：优先 `^x.y.z`；`0.x` 使用 `>=0.y.z <1.0.0`。
- 例外：`packages/agent-eve` 的官方 `eve` 依赖按用户要求使用 `latest`。
- 共享代码优先放 `packages/`；应用层只编排运行流程。
- 不把业务假设写死进模板；模板保持可复用、低耦合。
- 修改后按影响范围运行对应 package 的 `lint`、`typecheck`、`test`。
- 构建与回归验证默认直接在本地运行；只有用户明确要求 Docker 构建、Docker 启动或容器内验证时，才使用 Docker Compose。不要把 Docker 当作默认验证路径，也不要在未获授权时运行内部调用 `docker compose` 的 verifier。
- 架构术语以 `CONTEXT.md` 为准；架构候选维护在 `.scratch/architecture-review/backlog.md`。

## 常用命令

```bash
pnpm install
pnpm dev
pnpm lint
pnpm test
pnpm typecheck
pnpm build
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

## 本地服务

- Web: `http://localhost:13000`
- API: `http://localhost:14000`
- MCP Toolbox: `http://localhost:15000`
- PostgreSQL: `localhost:15432`
- Redis: `localhost:16379`

启动本地依赖：`docker compose up -d`

## 技能安装

- 查找可用技能时统一使用 `find-skills`。
- 真实技能目录：`.agents/skills/<skill-name>/`
- Codex 发现路径：`.codex/skills/<skill-name> -> ../../.agents/skills/<skill-name>`
- GitHub 技能用 sparse checkout 拉目标目录，再复制到 `.agents/skills/<skill-name>`。
- 如果技能自带 Codex hook，合并到 `.codex/hooks.json`，不要覆盖已有 hook。
- 不把已安装技能清单写进 AGENTS.md；这里只写安装方式和协作规则。

## Agent skills

- 任务、PRD 和 issue：本地 markdown，写入 `.scratch/<feature-slug>/`。See `docs/agents/issue-tracker.md`.
- issue triage 标签：`needs-triage`、`needs-info`、`ready-for-agent`、`ready-for-human`、`wontfix`。See `docs/agents/triage-labels.md`.
- 领域文档：根目录 `CONTEXT.md` 和 `docs/adr/`。See `docs/agents/domain.md`.

## 模块地图

- `apps/web`: 用户界面和浏览器端体验。
- `apps/api`: HTTP API、健康检查、Agent job intake、Chat SSE。
- `apps/worker`: BullMQ 后台任务消费和 Worker runtime 装配。
- `apps/toolbox`: MCP Toolbox `tools.yaml` 和数据库 Tool provider 配置。
- `packages/ui`: 共享 React UI 组件和样式工具。
- `packages/shared`: 前后端共享 Zod schema、类型和常量。
- `packages/db`: Prisma schema、Prisma Client 和数据库配置。
- `packages/logger`: Pino logger 封装。
- `packages/agent`: Agent runtime contract、`AGENT_RUNTIME` selector 和公共入口。
- `packages/agent-claude`: Claude Agent SDK backed runtime。
- `packages/agent-eve`: Eve filesystem-first runtime 和 `agent/` authored surface。
- `packages/mcp-host`: MCP Host 核心边界，统一管理 MCP server registry、client lifecycle、tools/list、tools/call 和交互式 UI 输出。

## 架构规则

- 每个明确任务或需求完成后，提交前必须使用 `improve-codebase-architecture` 做一轮代码架构审查。
- 架构审查产生的候选问题默认按该 skill 的推荐方案落地；只有涉及产品取舍、破坏性变更、成本明显扩大或外部约束无法判断时才向用户确认。
- 每个架构候选修复后单独提交，全部候选修复并验证完成后再统一推送。
- `apps/*` 只依赖 `@agent-template/agent` 的公共 runtime 边界，不直接依赖具体 runtime package。
- Agent runtime 只通过 `AGENT_RUNTIME=claude|eve` 选择；不要从 request 或 job payload 覆盖。
- Kimi Code 接入 Cloud 和 Eve 都使用 Anthropic-compatible 协议；API Key 只放本地 `.env` 或部署环境变量。
- `TOOLBOX_URL` 和 `TOOLBOX_TOOLSET` 只表达 Host-managed MCP 连接信息，不参与 runtime 选择。
- 生产 Agent 默认只加载 `apps/toolbox/tools.yaml` 中显式声明的自定义 toolset。
- MCP Host 是平台能力，统一放在 `@agent-template/mcp-host`；Claude/Eve runtime 不直接持有 Toolbox MCP connection。
- MCP Host server registry 默认从根目录 `mcp-host.config.json` 的 `servers` 读取；改 MCP Server 地址或 toolset 时改文件并重启服务，不改 Cloud/Eve runtime 代码。生产 server 的 `allowedTools` 是 Host 侧 allowlist；新增 Toolbox tool 时需同步更新 toolset 和 allowlist。旧的 `toolboxUrl` / `toolboxToolset` 仅作为兼容入口。
- Web 不直接连接 MCP Server；交互式 MCP 输出通过 `apps/api` 的 Chat SSE 或 MCP Host API 返回到前端。
- Queue runtime 暂不抽新 module；等第三个 queue consumer 或可替换 adapter 需求出现再抽。

## 提交规则

- 涉及 Git 提交、提交信息、changelog 或提交规范时，必须使用 `.codex/skills/chinese-commit-conventions`。
- 每个明确任务或需求完成后，先完成架构审查和必要修复，再默认提交并推送到当前跟踪分支；用户明确说“不要提交”“不要推送”“先别提交”时除外。
- 只查看、只分析、只给方案或没有文件改动时，不创建空提交。
- 按功能点提交，不把无关改动混进同一个提交。
- 提交前检查 `git status --short --branch`。
- 不提交 `.env`、构建产物、缓存目录、`node_modules`。
