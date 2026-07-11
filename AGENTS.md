# 项目协作指南

## 项目定位

- TypeScript Agent 平台模板；核心栈为 Next.js、Fastify、Prisma/PostgreSQL、Redis、BullMQ、MCP Toolbox、Claude Agent SDK、Eve、Zod、Pino、Vitest。
- `apps/` 放运行进程，`packages/` 放可复用能力；模块职责见各目录 `AGENTS.md`。

## 开发与验证

- 用户可见文案默认中文；技术名词保留英文。
- 依赖版本优先 `^x.y.z`；`0.x` 使用 `>=0.y.z <1.0.0`；`packages/agent-eve` 的官方 `eve` 依赖使用 `latest`。
- 共享代码优先放 `packages/`；应用层只编排运行流程；不要把业务假设写死进模板。
- 使用 pnpm：`pnpm install`、`pnpm dev`、`pnpm lint`、`pnpm test`、`pnpm typecheck`、`pnpm build`、`pnpm db:generate`、`pnpm db:migrate`、`pnpm db:seed`。
- 按影响范围运行 `pnpm --filter <package> lint|typecheck|test`；跨模块改动再运行全仓门禁。
- 默认在本地验证；只有用户明确要求时才运行 Docker Compose 或内部调用它的 verifier。
- 服务端口：Web `13000`、API `14000`、Toolbox `15000`、PostgreSQL `15432`、Redis `16379`；`pnpm toolbox:verify:local` 自行管理临时 Toolbox。

## Skills 管理

- `.agents/skills/` 是项目协作 Skills 的唯一真实来源，统一使用项目级 `npx skills` 管理，不手工维护 Skill 目录或 Agent 发现路径。
- 每个 `.agents/skills/*` 必须有 `skills-lock.json` 锁项；命令、更新流程和已知故障见 `docs/agents/skills.md`。
- 查找 Skill 时先使用 `find-skills` 工作流，再运行 `npx skills find <query>`。
- `.claude/skills/` 中指向 `.agents/skills/` 的协作 Skill 软链接由 `npx skills` 维护；其中的真实业务 Skill 目录与 `packages/agent-eve/agent/skills/` 继续由 `pnpm skills:generate:toolbox` 生成和同步。
- 前端 UI 设计指导不常驻安装；按 `apps/web/AGENTS.md` 和 `packages/ui/AGENTS.md` 使用固定版本的 UI Skills CLI 动态加载。`shadcn` 等工具型 Skill 仍按上述规则管理。
- 如果 Skill 自带 Codex hook，合并到 `.codex/hooks.json`，不要覆盖已有 hook。
- 不把已安装 Skills 清单写进 AGENTS.md；这里只写管理方式和协作规则。

## Agent skills

- 任务、PRD 和 issue：本地 markdown，写入 `.scratch/<feature-slug>/`。See `docs/agents/issue-tracker.md`.
- issue triage 标签：`needs-triage`、`needs-info`、`ready-for-agent`、`ready-for-human`、`wontfix`。See `docs/agents/triage-labels.md`.
- 领域文档：根目录 `CONTEXT.md` 和 `docs/adr/`。See `docs/agents/domain.md`.

## 架构规则

- 每个有文件改动的任务完成并验证后，提交前必须使用 `improve-codebase-architecture` 审查本次变更及直接影响模块。
- 与本次变更直接相关、非破坏性的候选默认修复；无关候选只报告，不扩大当前任务范围。
- 产品取舍、破坏性变更、成本明显扩大或外部约束不明时向用户确认；长期决策写入 `docs/adr/`，延期工作按 `docs/agents/issue-tracker.md` 建 issue，HTML 报告只放临时目录。
- `apps/*` 使用 Agent runtime 时只通过 `@agent-template/agent`，不直接依赖具体 runtime package；runtime 仅由部署环境的 `AGENT_RUNTIME=claude|eve` 选择。
- Claude/Eve 各自持有 Toolbox MCP Client；`@agent-template/toolbox-config` 只维护配置与 schema；Web 不直连 MCP Server。
- `AGENT_CAPABILITY_PROFILE` 只收窄模型可见 Tool；生产授权由 Toolbox OIDC、Tool scope 和数据库权限强制。

## 提交规则

- 涉及 Git 提交、提交信息、changelog 或提交规范时，必须使用 `chinese-commit-conventions` Skill。
- 有文件改动的任务完成后，按上方架构规则完成审查和必要修复，再默认提交并推送到当前跟踪分支；用户明确说“不要提交”“不要推送”“先别提交”时除外。
- 只查看、只分析、只给方案或没有文件改动时，不创建空提交。
- 按功能点提交，不把无关改动混进同一个提交。
- 提交前检查 `git status --short --branch`。
- 不提交 `.env`、构建产物、缓存目录、`node_modules`。
