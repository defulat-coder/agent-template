# packages/ecommerce-fixture 协作指南

## 职责

`packages/ecommerce-fixture` 管理 Toolbox 功能验证使用的确定性合成零售数据，不属于平台运行时数据库。

## 边界

- Prisma model、Client、migration history 和 seed 只使用 PostgreSQL `ecommerce_fixture` schema。
- `src/data.ts` 保持确定性，不读取当前时间、不包含真实客户或交易数据。
- `scripts/migrate.ts` 只在已存在业务表且 baseline 未登记时执行 Prisma baseline resolve，再运行 deploy。
- Toolbox SQL 必须显式使用 `ecommerce_fixture."Ecommerce*"`；平台表显式使用 `public`。
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
pnpm db:verify:migrations:empty
pnpm toolbox:verify:local
```
