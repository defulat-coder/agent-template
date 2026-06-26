# 项目协作指南

## 项目定位

这是一个 TypeScript Agent 平台模板，采用 pnpm Workspace + Turborepo。运行时应用放在 `apps/`，可复用能力放在 `packages/`。

核心栈：

- Web: Next.js + React + Tailwind CSS + shadcn/ui 风格组件 + Vitest
- API: Fastify + Prisma + PostgreSQL + Redis + BullMQ + Zod + Pino + Vitest
- Worker: BullMQ 后台任务处理 + Claude Agent SDK 封装

## 通用规则

- 用户可见文案默认使用中文，技术名词保留英文，例如 Next.js、Fastify、Prisma、Redis、BullMQ。
- 依赖版本必须锁住大版本：优先使用 `^x.y.z`；`0.x` 依赖使用 `>=0.y.z <1.0.0`。
- 共享代码优先放在 `packages/`，应用层只编排具体运行流程。
- 不要把业务假设写死进模板；模板应保持可复用、低耦合。
- 修改后按影响范围运行验证，最少运行对应 package 的 `lint`、`typecheck`、`test`。

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

安装 GitHub 仓库中的技能目录时使用这个流程：

```bash
rm -rf /tmp/<skill-name>
git clone --depth 1 --filter=blob:none --sparse <repo-url> /tmp/<skill-name>
cd /tmp/<skill-name>
git sparse-checkout set <path-to-skill>

cd /Users/xbjt/Documents/myself/project-template
mkdir -p .agents/skills .codex/skills
rm -rf .agents/skills/<skill-name> .codex/skills/<skill-name>
cp -R /tmp/<skill-name>/<path-to-skill> .agents/skills/<skill-name>
ln -s ../../.agents/skills/<skill-name> .codex/skills/<skill-name>
test -f .codex/skills/<skill-name>/SKILL.md
```

如果上游技能文件内部硬编码了 `.agents/skills/<skill-name>/...` 路径，必须保留 `.agents` 作为真实路径，不能只放 `.codex`。

当前已安装技能：

- `.agents/skills/agents-md`
- `.agents/skills/chinese-commit-conventions`
- `.agents/skills/shadcn`
- `.agents/skills/impeccable`
- `.agents/skills/react-best-practices`
- `.agents/skills/next-cache-components-adoption`
- `.agents/skills/next-cache-components-optimizer`
- `.agents/skills/next-dev-loop`
- `.agents/skills/supabase-postgres-best-practices`

## 模块地图

- `apps/web`: 用户界面和浏览器端体验。
- `apps/api`: HTTP API、健康检查、任务入队。
- `apps/worker`: BullMQ 后台任务消费。
- `packages/ui`: 共享 React UI 组件和样式工具。
- `packages/shared`: 前后端共享 Zod schema、类型和常量。
- `packages/db`: Prisma schema、Prisma Client 和数据库配置。
- `packages/logger`: Pino logger 封装。
- `packages/agent`: Claude Agent SDK 配置和加载边界。

## 提交规则

- 任何涉及 Git 提交、提交信息、changelog 或提交规范的工作，都必须使用 `.codex/skills/chinese-commit-conventions`。
- 按功能点提交，不把无关改动混进同一个提交。
- 提交前检查 `git status --short --branch`。
- 不提交 `.env`、构建产物、缓存目录、`node_modules`。
