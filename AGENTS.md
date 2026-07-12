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
- 项目 Wiki 由项目 `devDependencies` 中的 ZRead CLI 通过 `pnpm docs:zread:update` 生成；`.zread/config/index.yaml` 组合项目级配置，`.zread/wiki/current` 指向版本的 `wiki.json` 与 Markdown 是产物事实源。生成页不得手工维护，CI 只允许手动触发并通过 PR 更新。

## 工程原则

- **Fail Fast / Errors Never Pass Silently**：禁止用兜底、忽略异常或伪造成功吞掉错误；错误必须携带足够上下文显式失败。
- **Fix the Cause, Not the Symptom / Don't Paper Over Bugs**：先复现并定位根因，再做完整修复；禁止用仅覆盖当前症状的特判或补丁掩盖缺陷。
- **Make It Observable**：定位证据不足时先补日志、指标或追踪并诚实说明信息不足；没有验证证据不得宣称问题已修复。
- **Design for Debugging / Traceability**：关键路径必须记录关联标识、关键状态转换和失败上下文，使一次执行可端到端追溯。
- **Living Documentation / Single Source of Truth**：关键技术栈、架构边界或产品方向变化时，同步更新适用范围内的 `AGENTS.md` 和必要 ADR，文档与代码同批演进。
- **Don't Break Mainline**：大规模重构或实验性改动开始前，必须先创建并切换到独立分支；未验证通过不得合入主线。

## Skills 管理

- `.agents/skills/` 是项目协作 Skills 的唯一真实来源，统一使用项目级 `npx skills` 管理，不手工维护 Skill 目录或 Agent 发现路径。
- 每个 `.agents/skills/*` 必须有 `skills-lock.json` 锁项；命令、更新流程和已知故障见 `docs/agents/skills.md`。
- 查找 Skill 时先使用 `find-skills` 工作流，再运行 `npx skills find <query>`。
- 根目录 `.claude/skills/` 只放 `npx skills` 维护、指向 `.agents/skills/` 的项目协作 Skill 软链接；Claude runtime 业务 Skill 位于 `packages/agent-claude/.claude/skills/`，并与 `packages/agent-eve/agent/skills/` 一起由 `pnpm skills:generate:toolbox` 生成和同步。
- 前端 UI 设计指导默认按 `apps/web/AGENTS.md` 和 `packages/ui/AGENTS.md` 使用固定版本的 UI Skills CLI 动态加载；用户明确要求常驻安装时，仍统一使用项目级 `npx skills` 管理。`shadcn` 等工具型 Skill 也按上述规则管理。
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
- Web `/docs` 直接构建 `.zread/wiki` 的当前版本，不把 `zread browse` 作为部署进程；生成只使用项目本地 CLI 和 `.zread/config/` 的多文件配置，在隔离 clone 与隔离 HOME 中执行并只发布校验后的当前版本。长期决策见 `docs/adr/0016-zread-generated-project-wiki.md`。

## 提交规则

- 涉及 Git 提交、提交信息、changelog 或提交规范时，必须使用 `chinese-commit-conventions` Skill。
- 有文件改动的任务完成后，按上方架构规则完成审查和必要修复，再默认创建原子提交；仅在用户明确要求时推送。
- 只查看、只分析、只给方案或没有文件改动时，不创建空提交。
- 按功能点提交，不把无关改动混进同一个提交。
- 提交前检查 `git status --short --branch`。
- 不提交 `.env`、构建产物、缓存目录、`node_modules`。
- AI 提交必须包含自身 `Co-Authored-By: <name> <email>` trailer。
