# packages/db 协作指南

## 职责

`packages/db` 管理平台 `public` schema、Prisma 7 配置、PostgreSQL adapter 和 Prisma Client 导出。

## 能力边界

- `prisma/schema.prisma` 是数据模型来源。
- `prisma.config.ts` 管理 Prisma 7 datasource 配置。
- `prisma/seed.ts` 只写入确定性的 Agent 平台 `TemplateEvent`；电商验证数据属于 `packages/ecommerce-fixture`。
- `src/index.ts` 导出 Prisma Client 和 `AgentRunRepository` adapter。
- Agent run claim、heartbeat、execution event 和 terminal update 必须以 PostgreSQL 原子条件实现 fencing；不能先读 token 再无条件写。
- execution lease 的唯一时钟是 PostgreSQL `clock_timestamp()`；应用传入的业务时间不得参与 lease ownership 判定。
- execution event insert 必须在同一 fenced SQL 中从 AgentRun 投影 `executionAttempt`；lifecycle-only event 使用 `null`，不能由调用方伪造 attempt。
- 默认数据库连接使用 `localhost:15432`，避免和本机默认 PostgreSQL 冲突。
- Prisma 目录内的 schema、migration、seed 规则见 `prisma/AGENTS.md`。

## 不应该做

- 不写 HTTP 路由。
- 不写业务 service。
- 不把 Agent run 状态机放进 repository；这里只实现原子读写。
- 不在 schema 中加入模板无关业务模型。
- 不导出 Ecommerce fixture model 或让平台应用依赖 fixture package。
- 不手动编辑 `generated/` 输出。

## 相关技能

- Prisma 连接、provider、driver adapter 配置：使用 `prisma-database-setup`。
- PostgreSQL schema、索引、RLS、连接池最佳实践：使用 `supabase-postgres-best-practices`。
- 慢查询、执行计划和索引优化：使用 `sql-optimization-patterns`。

## 验证

```bash
pnpm db:generate
pnpm agent-runs:verify:local
pnpm db:verify:boundaries
pnpm db:seed
pnpm --filter @agent-template/db lint
pnpm --filter @agent-template/db typecheck
pnpm --filter @agent-template/db build
```

本地迁移前确认 PostgreSQL 已监听 `localhost:15432`，然后运行 `pnpm db:migrate`。只有显式选择容器模式时才运行 Docker Compose。

生产或 CI 通过根命令 `pnpm db:deploy` 按顺序应用平台 migration 与 fixture baseline/migration。

## 官方参考

- Prisma Migrate 开发/生产工作流: `https://www.prisma.io/docs/orm/prisma-migrate/workflows/development-and-production`
- 部署数据库变更: `https://www.prisma.io/docs/orm/prisma-client/deployment/deploy-database-changes-with-prisma-migrate`
- Seeding: `https://www.prisma.io/docs/orm/prisma-migrate/workflows/seeding`
