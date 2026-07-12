# Ecommerce fixture Prisma 规则

- `schema.prisma` 只声明 `ecommerce_fixture`，每个 model/enum 必须有 `@@schema("ecommerce_fixture")`。
- `0_ecommerce_fixture_baseline` 同时用于空库重建和已有数据的 Prisma baseline，不删除或重写。
- 结构变更新增 migration；保留退款范围 CHECK 与已结算订单 partial covering index。
- Seed 使用稳定 id，在单一事务内按外键拓扑通过批量 deleteMany/createMany 替换隔离 schema；不得引入随机数、当前时间、PII 或外部数据。
- 财务、库存、物流、采购和营销结构变更只能新增 migration，不修改 baseline；金额使用 Decimal，业务时间使用 Timestamptz，并为跨域外键、异常查询和时间窗查询建立索引。
- 生产应用已提交 migration；本地默认不启动 Docker。
