# packages/db 协作指南

## 职责

`packages/db` 管理 Prisma schema、Prisma 7 配置、PostgreSQL adapter 和 Prisma Client 导出。

## 能力边界

- `prisma/schema.prisma` 是数据模型来源。
- `prisma.config.ts` 管理 Prisma 7 datasource 配置。
- `prisma/seed.ts` 写入确定性的 Agent 平台示例数据。
- `src/index.ts` 导出可复用 Prisma Client。
- 默认数据库连接使用 `localhost:15432`，避免和本机默认 PostgreSQL 冲突。
- Prisma 目录内的 schema、migration、seed 规则见 `prisma/AGENTS.md`。

## 不应该做

- 不写 HTTP 路由。
- 不写业务 service。
- 不在 schema 中加入模板无关业务模型。
- 不手动编辑 `generated/` 输出。

## 验证

```bash
pnpm db:generate
pnpm db:seed
pnpm --filter @agent-template/db lint
pnpm --filter @agent-template/db typecheck
pnpm --filter @agent-template/db build
```

本地迁移需要 Docker daemon 已启动：

```bash
docker compose up -d
pnpm db:migrate
```

生产或 CI 只应用已提交 migration：`pnpm --filter @agent-template/db prisma migrate deploy --schema prisma/schema.prisma`。

## 官方参考

- Prisma Migrate 开发/生产工作流: `https://www.prisma.io/docs/orm/prisma-migrate/workflows/development-and-production`
- 部署数据库变更: `https://www.prisma.io/docs/orm/prisma-client/deployment/deploy-database-changes-with-prisma-migrate`
- Seeding: `https://www.prisma.io/docs/orm/prisma-migrate/workflows/seeding`
