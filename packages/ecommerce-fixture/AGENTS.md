# packages/ecommerce-fixture 协作指南

## 职责

`packages/ecommerce-fixture` 管理 Toolbox 功能验证使用的确定性合成电商、财务、库存、物流、采购和营销数据，不属于平台运行时数据库。

## 边界

- Prisma model、Client、migration history 和 seed 只使用 PostgreSQL `ecommerce_fixture` schema。
- `src/data.ts` 与 `src/business-data.ts` 保持确定性，不读取当前时间、不包含真实客户、供应商或交易数据；跨域记录使用稳定主键和可解释的业务关联。
- Seed 只操作隔离的 `ecommerce_fixture` schema，在单一事务内按外键拓扑先清理、再通过有界批次 `createMany` 完整替换；不要恢复逐行 upsert，也不要对 `public` 执行删除。
- 大集合必须分批写入，避免 PostgreSQL 参数上限；异常数据必须能由状态、时间线或金额差异解释，不能孤立随机生成。
- `scripts/migrate.ts` 只在五张业务表完整存在且 baseline 未登记时执行 Prisma baseline resolve；部分 schema drift 必须 fail closed，再运行 deploy。
- Toolbox 业务 SQL 必须显式限定 `ecommerce_fixture` 中本 package 持有的 model；平台表显式限定 `public`。
- 不让 API、Worker 或 `@agent-template/db` 依赖本 package。
- 不手改 `generated/`。

## 验证

```bash
pnpm --filter @agent-template/ecommerce-fixture lint
pnpm --filter @agent-template/ecommerce-fixture typecheck
pnpm --filter @agent-template/ecommerce-fixture test
pnpm --filter @agent-template/ecommerce-fixture build
pnpm db:verify:boundaries
pnpm db:verify:fixture:empty
pnpm db:verify:fixture:partial
pnpm db:verify:migrations:empty
pnpm toolbox:verify:local
```
