# 项目协作指南

## 项目定位

这是一个 TypeScript Agent 平台模板，采用 pnpm Workspace + Turborepo。运行时应用放在 `apps/`，可复用能力放在 `packages/`。

核心栈：

- Web: Next.js + React + Tailwind CSS + shadcn/ui 风格组件 + Vitest
- API: Fastify + Prisma + PostgreSQL + Redis + BullMQ + Zod + Pino + Vitest
- Worker: BullMQ 后台任务处理 + 可选 Agent runtime

## 通用规则

- 用户可见文案默认使用中文，技术名词保留英文，例如 Next.js、Fastify、Prisma、Redis、BullMQ。
- 依赖版本必须锁住大版本：优先使用 `^x.y.z`；`0.x` 依赖使用 `>=0.y.z <1.0.0`。
- 例外：`packages/agent-eve` 的官方 `eve` 依赖按用户要求使用 `latest`，不要锁版本或 major range。
- 共享代码优先放在 `packages/`，应用层只编排具体运行流程。
- 不要把业务假设写死进模板；模板应保持可复用、低耦合。
- 修改后按影响范围运行验证，最少运行对应 package 的 `lint`、`typecheck`、`test`。
- 架构术语以 `CONTEXT.md` 为准；架构候选和执行记录维护在 `.scratch/architecture-review/backlog.md`。

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
```

## 本地服务

- Web: `http://localhost:3000`
- API: `http://localhost:4000`
- PostgreSQL: `localhost:55432`
- Redis: `localhost:56379`

启动本地依赖：

```bash
docker compose up -d
```

## 技能安装方式

项目内技能统一采用“双路径、单份真实文件”的方式：

- 真实技能目录放在 `.agents/skills/<skill-name>/`
- Codex 发现路径使用符号链接 `.codex/skills/<skill-name> -> ../../.agents/skills/<skill-name>`
- 如果技能自带 Codex hook，再把 hook 配置安装到 `.codex/hooks.json`；已有 hook 时需要合并，不要直接覆盖。

- 安装 GitHub 技能时用 sparse checkout 拉取目标目录，复制到 `.agents/skills/<skill-name>`，再创建 `.codex/skills/<skill-name>` 符号链接并验证 `SKILL.md`。
- 如果上游技能文件内部硬编码了 `.agents/skills/<skill-name>/...` 路径，必须保留 `.agents` 作为真实路径，不能只放 `.codex`。

## Agent skills

### Issue tracker

任务、PRD 和 issue 使用本地 markdown 管理，写入 `.scratch/<feature-slug>/`；没有外部 PR triage 队列。See `docs/agents/issue-tracker.md`.

### Triage labels

使用默认五状态标签：`needs-triage`、`needs-info`、`ready-for-agent`、`ready-for-human`、`wontfix`。See `docs/agents/triage-labels.md`.

### Domain docs

使用 single-context：根目录 `CONTEXT.md` 和 `docs/adr/`，需要时由相关 skill 懒创建。See `docs/agents/domain.md`.

## 模块地图

- `apps/web`: 用户界面和浏览器端体验。
- `apps/api`: HTTP API、健康检查、Agent job intake 和任务入队。
- `apps/worker`: BullMQ 后台任务消费和 Worker runtime 装配。
- `packages/ui`: 共享 React UI 组件和样式工具。
- `packages/shared`: 前后端共享 Zod schema、类型和常量。
- `packages/db`: Prisma schema、Prisma Client 和数据库配置。
- `packages/logger`: Pino logger 封装。
- `packages/agent`: Agent runtime contract、`AGENT_RUNTIME` selector 和公共入口。
- `packages/agent-claude`: Claude Agent SDK backed runtime。
- `packages/agent-eve`: Eve filesystem-first runtime 和 `agent/` authored surface。

## 架构规则

- Agent job intake 的外部 seam 是 `AgentJobIntake.enqueue(input)`；Fastify route 不直接管理 Redis URL 或 BullMQ lifecycle。
- Worker runtime 的 BullMQ event wiring 留在 Worker adapter implementation 内；测试穿过 `onCompleted` / `onFailed` 回调 interface。
- Agent runtime 只通过环境变量 `AGENT_RUNTIME=claude|eve` 选择；不要从 job payload 覆盖 runtime。
- `runAgentJob` 是 Agent job execution seam；它负责 payload validation、runtime dispatch 和 execution result assembly。
- 未配置的 runtime 返回 `status: "skipped"` 和原因，不伪装成已执行成功。
- Eve execution adapter 通过 `EVE_AGENT_HOST` 连接官方 Eve HTTP API；`EVE_AGENT_MODEL` 同时驱动 runtime state 和 `agent/agent.ts`。
- Agent run event producer seam 在 runtime adapter 返回值上：`AgentJobResult.events` 只传递 runtime 已产生的原始事件；不要提前新增 streaming endpoint 或持久化 store。
- `apps/*` 只依赖 `@agent-template/agent` 的公共 runtime 边界，不直接依赖具体 runtime package。
- Queue runtime 暂不抽成新 module；只有新增第三个 queue consumer、queue option 规则增长或 adapter 需要替换测试时再打开。

## 提交规则

- 任何涉及 Git 提交、提交信息、changelog 或提交规范的工作，都必须使用 `.codex/skills/chinese-commit-conventions`。
- 按功能点提交，不把无关改动混进同一个提交。
- 提交前检查 `git status --short --branch`。
- 不提交 `.env`、构建产物、缓存目录、`node_modules`。
