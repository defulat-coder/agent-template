# Toolbox 业务语义契约

## 适用边界

本项目使用标准 PostgreSQL source，因此这里的“语义层”是模型可见的 Toolbox Tool 契约：业务指标口径、Tool 名称与描述、参数、MCP annotations 和按任务分组的 Toolset。它不是 AlloyDB AI NL 的自然语言转 SQL 语义配置，也不是 Looker 模型。

`tools.yaml` 是运行时 Tool、Toolset 和 annotations 的可执行事实源。`semantic/ecommerce.yaml` 中的 `queryContracts` 是认证指标、维度、返回字段和限制的可执行事实源；本地门禁与业务 Skill 共同使用 `BusinessSemanticCatalogSchema`，避免文档与执行漂移。

Toolbox 返回数据库查询结果，Agent 必须依据 Skill 中随附的语义目录解释指标、维度、时间窗和限制。当前 PostgreSQL fixture 没有独立刷新水位，因此回答不得把查询时间冒充为数据时间；需要机器可读结果溯源时，应在未来独立设计结果 envelope，而不是在 MCP Client 中隐式改写 Tool 返回值。

智能问数的业务术语、值映射、歧义规则和 golden cases 位于 [semantic/](./semantic/)，生产落地方式见 [INTELLIGENT_QUERY.md](./INTELLIGENT_QUERY.md)。

后续新增业务 Tool 的分层选择和强制准入要求以 [INTELLIGENT_QUERY.md](./INTELLIGENT_QUERY.md) 为准；本文件只说明当前 PostgreSQL Tool 的业务契约，不能代替外部语义层或 AlloyDB AI NL 的治理配置。

AlloyDB AI NL 或 Looker 只能在项目切换到对应数据源并完成安全、费用和部署评估后单独引入，不得把它们的专属配置写进当前 PostgreSQL 模板。

## 电商指标口径

| 指标                    | 定义                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------ |
| 已结算订单              | `status IN ('PAID', 'FULFILLED', 'REFUNDED')`；取消和待支付订单不进入销售口径        |
| `grossSales`            | 已结算订单 `paidTotal` 之和                                                          |
| `refundAmount`          | 已结算订单 `refundedTotal` 之和                                                      |
| `netSales`              | `grossSales - refundAmount`                                                          |
| `averageOrderValue`     | 渠道内平均单笔 `paidTotal - refundedTotal`                                           |
| `grossMerchandiseSales` | 已结算订单项 `lineTotal` 之和，不包含运费                                            |
| `netMerchandiseSales`   | 订单级退款按 `lineTotal / paidTotal` 分摊后的商品净销售额                            |
| 履约异常                | `status = 'PAID' AND fulfilledAt IS NULL`；`hoursWaiting` 以请求参数 `to` 为参考时刻 |

时间窗统一使用 ISO-8601 UTC `[from, to)`，开始包含、结束不包含，Tool SQL 与 Agent 输入 schema 限制最长 31 天。销售分析使用 `paidAt`，订单运营视图使用 `placedAt`。

## 业务任务与 Toolset

| Toolset                            | Skill                              | 业务任务                       | Tool 数 |
| ---------------------------------- | ---------------------------------- | ------------------------------ | ------: |
| `ecommerce-sales-analytics`        | `ecommerce-sales-analysis`         | 销售趋势、渠道、区域与客户分群 |       4 |
| `ecommerce-product-analytics`      | `ecommerce-product-analysis`       | 商品与品类销售分析             |       2 |
| `ecommerce-order-operations`       | `ecommerce-order-operations`       | 订单查询与单据排障             |       2 |
| `ecommerce-fulfillment-operations` | `ecommerce-fulfillment-operations` | 履约积压与异常订单             |       2 |

`agent_template_read_model` 是完整只读开发 Toolset，不作为新的业务分组示例。四个业务 Toolset 都有官方 `skills-generate` caller；为了让 Skill 专注单一任务并减少 context rot，保持在 2–4 个 Tool。

## MCP annotations

当前所有 SQL Tool 都是本地数据库内的确定性只读查询，统一声明：

```yaml
annotations:
  readOnlyHint: true
  destructiveHint: false
  idempotentHint: true
  openWorldHint: false
```

annotations 是提供给 MCP Client 的语义提示，不是权限控制。模型可见范围由 runtime capability profile 收窄；真实执行权限仍由 Toolbox OIDC、Tool scope、受限数据库角色、RLS/等效控制和运行时输入校验共同约束。

## 命名与兼容性

Google 官方 Style Guide 建议 Tool 使用 `snake_case` 的 `<action>_<resource>`，Toolset 使用 `kebab-case`。本项目已发布的 15 个连字符 Tool 名是 Claude、Eve 和外部 MCP Client 的公开契约，本次保留以避免破坏性变更；不创建重复别名，避免扩大模型工具上下文。新增 Tool 使用 `snake_case`，新增 Toolset 使用 `kebab-case`。

## 新增 Tool 检查清单

- 以业务结果而不是底层 CRUD 为单元，读写 Tool 分离。
- 描述业务口径、返回结果和不可推断的边界；参数含义仅写在参数描述中。
- 模型可见参数不超过 5 个，优先基础类型；时间格式给出具体示例。
- 业务列表查询必须有硬性 `LIMIT/OFFSET`、稳定排序、最大值和窗口 `totalCount`。聚合查询必须有时间或业务边界。
- 更新相应业务 Toolset、`@agent-template/toolbox-config` 的 Tool/Profile、Claude/Eve 原生 client 配置和生成的 Skill。
- 更新业务语义目录、golden cases 和所属领域的数据负责人；未定义的术语先澄清，不让模型猜测字段或取值。
- 明确 Tool 的业务时区、`[from, to)` 边界与数据库字段时间类型；UTC 参数不能依赖 PostgreSQL session 的隐式时区转换。
- 分类确认：平台只读运维 Tool、认证业务问数 Tool、semantic query compiler 或外部语义层 Tool 的准入要求不同，详见 [智能问数落地](./INTELLIGENT_QUERY.md#tool-分类与准入矩阵)。
- 运行 `pnpm toolbox:check`，不使用 Docker。

## 官方参考

- [Toolbox Style Guide](https://mcp-toolbox.dev/reference/style-guide/)
- [Tools 与 annotations](https://mcp-toolbox.dev/documentation/configuration/tools/)
- [Toolsets](https://mcp-toolbox.dev/documentation/configuration/toolsets/)
- [AlloyDB MCP quickstart](https://mcp-toolbox.dev/samples/alloydb/mcp_quickstart/)
