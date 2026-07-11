# packages/db/prisma 协作指南

## 职责

`packages/db/prisma` 管理平台 `public` schema、migration history 和确定性 `TemplateEvent` seed。

## 规则

- `schema.prisma` 是数据模型来源；数据库结构变更必须生成并提交 migration。
- 开发环境用根命令 `pnpm db:migrate` 生成/应用两个 schema 的 migration；生产或 CI 用 `pnpm db:deploy`。
- 不手动改已提交且已应用的 migration；需要修正时新增 migration。
- 不用 `prisma db push` 作为长期方案；只能用于一次性原型验证，落地前必须转成 migration。
- `seed.ts` 必须幂等，使用稳定 id 和 `upsert`，不要写随机数据或依赖当前时间。
- 示例数据保留模板语境，不加入具体客户业务表；Toolbox 零售数据只放 `packages/ecommerce-fixture`。
- Agent run status、event sequence 与 cancellation 字段是持久化 invariant；迁移需保留原子状态转换所需索引和唯一约束。

## 验证

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm --filter @agent-template/db lint
pnpm --filter @agent-template/db typecheck
```

## 官方参考

- Prisma Migrate: `https://www.prisma.io/docs/orm/prisma-migrate`
- Development and production: `https://www.prisma.io/docs/orm/prisma-migrate/workflows/development-and-production`
- Deploying database changes: `https://www.prisma.io/docs/orm/prisma-client/deployment/deploy-database-changes-with-prisma-migrate`
- Seeding: `https://www.prisma.io/docs/orm/prisma-migrate/workflows/seeding`
