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

默认验证前确认本机 PostgreSQL 与 Redis 已监听上述端口；`pnpm toolbox:verify:local` 会自行启动并清理临时 Toolbox。`docker compose up -d` 只用于用户明确要求的容器模式。

## Skills 管理

- `.agents/skills/` 是项目协作 Skills 的唯一真实来源，统一使用 `npx skills` 管理，不手工复制、更新、删除 Skill 目录或维护 Agent 发现路径。
- 每个 `.agents/skills/*` 都必须有对应的 `skills-lock.json` 锁项；锁文件只由 `npx skills add/update/remove` 生成，不手工编辑。
- 查找：先使用 `find-skills` 工作流，再运行 `npx skills find <query>`。
- 安装：`npx skills add <source> --agent codex claude-code`；使用项目级作用域，不加 `-g`，默认同时支持 Codex 与 Claude Code。
- 查看、更新、删除：`npx skills list`、`npx skills update [skills...] -p`、`npx skills remove [skills]`。
- `.claude/skills/` 中指向 `.agents/skills/` 的协作 Skill 软链接由 `npx skills` 维护；其中的真实业务 Skill 目录与 `packages/agent-eve/agent/skills/` 继续由 `pnpm skills:generate:toolbox` 生成和同步。
- 如果 Skill 自带 Codex hook，合并到 `.codex/hooks.json`，不要覆盖已有 hook。
- 不把已安装 Skills 清单写进 AGENTS.md；这里只写管理方式和协作规则。

## Agent skills

- 任务、PRD 和 issue：本地 markdown，写入 `.scratch/<feature-slug>/`。See `docs/agents/issue-tracker.md`.
- issue triage 标签：`needs-triage`、`needs-info`、`ready-for-agent`、`ready-for-human`、`wontfix`。See `docs/agents/triage-labels.md`.
- 领域文档：根目录 `CONTEXT.md` 和 `docs/adr/`。See `docs/agents/domain.md`.

## 模块地图

- `apps/web`: 用户界面和浏览器端体验；`apps/web-qa`: Codex Browser 测试计划与确定性 HTTP/SSE fixture。
- `apps/api`: HTTP API、健康检查、Agent job intake、Chat SSE。
- `apps/worker`: BullMQ 后台任务消费和 Worker runtime 装配。
- `apps/toolbox`: MCP Toolbox `tools.yaml` 和数据库 Tool provider 配置。
- `packages/ui`: 共享 React UI 组件和样式工具。
- `packages/shared`: 前后端共享 Zod schema、类型和常量。
- `packages/db`: Prisma schema、Prisma Client 和数据库配置。
- `packages/ecommerce-fixture`: 独立 `ecommerce_fixture` schema、确定性零售数据、migration 与 seed；只服务 Toolbox 功能验证。
- `packages/logger`: Pino logger 封装。
- `packages/agent`: Agent runtime contract、`AGENT_RUNTIME` selector 和公共入口。
- `packages/agent-claude`: Claude Agent SDK backed runtime。
- `packages/agent-eve`: Eve filesystem-first runtime 和 `agent/` authored surface。
- `packages/toolbox-config`: Claude/Eve 共用的 Toolbox URL、Bearer token、能力 Profile 和业务语义 schema；不持有 MCP client lifecycle。

## 架构规则

- 每个明确任务或需求完成后，提交前必须使用 `improve-codebase-architecture` 做一轮代码架构审查。
- 架构审查产生的候选问题默认按该 skill 的推荐方案落地；只有涉及产品取舍、破坏性变更、成本明显扩大或外部约束无法判断时才向用户确认。
- 每个架构候选修复后单独提交，全部候选修复并验证完成后再统一推送。
- `apps/*` 只依赖 `@agent-template/agent` 的公共 runtime 边界，不直接依赖具体 runtime package。
- Agent runtime 只通过 `AGENT_RUNTIME=claude|eve` 选择；不要从 request 或 job payload 覆盖。
- Kimi Code 接入 Claude 和 Eve 都使用 Anthropic-compatible 协议；API Key 只放本地 `.env` 或部署环境变量。
- `TOOLBOX_URL`、`TOOLBOX_AUTH_TOKEN` 和 `AGENT_CAPABILITY_PROFILE` 只配置当前 runtime 的 Toolbox MCP Client，不参与 runtime 选择。
- 生产 Agent 默认只加载 `apps/toolbox/tools.yaml` 中显式声明的自定义 toolset。
- Claude runtime 使用 SDK HTTP MCP server 配置直连 Toolbox；Eve runtime 使用 `agent/connections/toolbox.ts` 的 `defineMcpClientConnection` 直连 Toolbox。不得恢复共享 MCP Host 或 API MCP 代理。
- `@agent-template/toolbox-config` 只统一配置解析、能力 Profile 与语义 schema；不得创建 MCP Client、管理连接生命周期或代理调用。
- `AGENT_CAPABILITY_PROFILE` 限制模型可见 Tool；生产授权仍由 Toolbox OIDC、Tool scope、受限数据库角色与 RLS/等效控制强制。
- Web 不直接连接 MCP Server；Tool 调用由当前 Agent runtime 执行，API 只转发 Agent Chat SSE 事件和最终结果。
- Queue runtime 暂不抽新 module；等第三个 queue consumer 或可替换 adapter 需求出现再抽。

## 提交规则

- 涉及 Git 提交、提交信息、changelog 或提交规范时，必须使用 `chinese-commit-conventions` Skill。
- 每个明确任务或需求完成后，先完成架构审查和必要修复，再默认提交并推送到当前跟踪分支；用户明确说“不要提交”“不要推送”“先别提交”时除外。
- 只查看、只分析、只给方案或没有文件改动时，不创建空提交。
- 按功能点提交，不把无关改动混进同一个提交。
- 提交前检查 `git status --short --branch`。
- 不提交 `.env`、构建产物、缓存目录、`node_modules`。
