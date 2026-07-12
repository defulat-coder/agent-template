---
name: supply-chain-operations
description: 分析库存健康、缺货风险、仓库库存、采购支出、供应商表现和采购单异常。用户询问补货、库存或采购运营时使用。
---

## Usage

本项目通过可执行语义层访问 Toolbox。加载本 Skill 后，必须调用 `mcp__semantic_query__query_business_data`，传入用户原始问题和本目录中的 canonical candidate；不要直接调用底层业务 Toolbox Tool，也不要生成 SQL。语义 Tool 会完成消歧、时间归一、认证查询契约选择、Toolbox 执行和结果来源封装。

## Workflow

1. 读取 `references/supply-chain.yaml`，从中选择 catalog、intent、metric 和 dimension canonical id。
2. 调用 `mcp__semantic_query__query_business_data`；不得提交 Tool 名、SQL、表名、列名、租户或授权范围。
3. 返回 `clarification` 时向用户原样澄清，取得答案后重新解析；不要猜测。
4. 返回 `unsupported` 时说明当前认证查询目录的限制；不要绕过语义层。
5. 返回 `result` 时只依据 Semantic result envelope 回答，并说明指标、UTC `[from, to)` 时间窗、维度、过滤和限制。

## Business semantic catalog

涉及业务术语、指标、维度或枚举取值时，只使用该目录认证的术语和口径。底层认证路径为 `list_purchase_order_exceptions`、`list_stockout_risks`、`summarize_inventory_by_warehouse`、`summarize_inventory_health`、`summarize_procurement_spend`、`summarize_supplier_performance`，仅供理解覆盖范围，不能由模型直接调用。

## Internal certified query paths

### list_purchase_order_exceptions

分页返回明确 UTC 采购下单时间窗内已延期、迟收货或截至 to 超过预计到货时间仍未收货的采购单。
已取消采购单不属于异常；delayedDays 使用合成采购记录，对未收货单同时返回相对 to 的 currentDelayedDays。

#### Parameters

| Name   | Type    | Description                                                                | Required | Default |
| :----- | :------ | :------------------------------------------------------------------------- | :------- | :------ |
| from   | string  | ISO-8601 UTC 采购下单时间窗开始时间（包含），例如 2026-06-01T00:00:00Z。   | Yes      |         |
| to     | string  | ISO-8601 UTC 采购下单时间窗结束时间（不包含），例如 2026-06-30T00:00:00Z。 | Yes      |         |
| limit  | integer | 最多返回的异常采购单数量。                                                 | No       | `50`    |
| offset | integer | 从稳定排序结果中跳过的异常采购单数量；首页传 0。                           | No       | `0`     |

---

### list_stockout_risks

分页返回明确 UTC 快照时间窗内可用库存不高于安全库存或已标记风险的仓库 SKU。
availableUnits = onHand - reserved；结果按风险等级、缺口、快照时间和快照 ID 稳定排序。

#### Parameters

| Name   | Type    | Description                                                                | Required | Default |
| :----- | :------ | :------------------------------------------------------------------------- | :------- | :------ |
| from   | string  | ISO-8601 UTC 库存快照时间窗开始时间（包含），例如 2026-06-01T00:00:00Z。   | Yes      |         |
| to     | string  | ISO-8601 UTC 库存快照时间窗结束时间（不包含），例如 2026-06-30T00:00:00Z。 | Yes      |         |
| limit  | integer | 最多返回的缺货风险记录数量。                                               | No       | `50`    |
| offset | integer | 从稳定排序结果中跳过的风险记录数量；首页传 0。                             | No       | `0`     |

---

### summarize_inventory_by_warehouse

按仓库汇总明确 UTC 快照时间窗内的 SKU 数、在库、可用、在途、风险 SKU 和库存金额。
averageDailyCapacityUtilization 使用时间窗内 onHand 总和 /（capacityUnits \* 快照自然日数）；同一仓库多日快照分别计入。

#### Parameters

| Name | Type   | Description                                                                | Required | Default |
| :--- | :----- | :------------------------------------------------------------------------- | :------- | :------ |
| from | string | ISO-8601 UTC 库存快照时间窗开始时间（包含），例如 2026-06-01T00:00:00Z。   | Yes      |         |
| to   | string | ISO-8601 UTC 库存快照时间窗结束时间（不包含），例如 2026-06-30T00:00:00Z。 | Yes      |         |

---

### summarize_inventory_health

按库存风险等级汇总明确 UTC 快照时间窗内的 SKU、在库、占用、在途、安全库存和库存金额。
availableUnits = onHand - reserved；inventoryValue = onHand \* unitCost，单个 SKU 的多日快照会分别计入。

#### Parameters

| Name | Type   | Description                                                                | Required | Default |
| :--- | :----- | :------------------------------------------------------------------------- | :------- | :------ |
| from | string | ISO-8601 UTC 库存快照时间窗开始时间（包含），例如 2026-06-01T00:00:00Z。   | Yes      |         |
| to   | string | ISO-8601 UTC 库存快照时间窗结束时间（不包含），例如 2026-06-30T00:00:00Z。 | Yes      |         |

---

### summarize_procurement_spend

按供应商品类汇总明确 UTC 下单时间窗内的采购单数、SKU 数、采购金额、延期单数和平均延期天数。
已取消采购单不进入汇总；amount 是合成采购订单金额，不代表已付款现金支出或会计成本确认。

#### Parameters

| Name | Type   | Description                                                                | Required | Default |
| :--- | :----- | :------------------------------------------------------------------------- | :------- | :------ |
| from | string | ISO-8601 UTC 采购下单时间窗开始时间（包含），例如 2026-06-01T00:00:00Z。   | Yes      |         |
| to   | string | ISO-8601 UTC 采购下单时间窗结束时间（不包含），例如 2026-06-30T00:00:00Z。 | Yes      |         |

---

### summarize_supplier_performance

按供应商汇总明确 UTC 采购下单时间窗内的采购额、延期单、实际准时率，并返回供应商档案评级和目标准时率。
已取消采购单不进入汇总；actualOnTimeRate 以 receivedAt <= expectedAt 的已收货采购单为分母，未收货单不计入该比例。

#### Parameters

| Name | Type   | Description                                                                | Required | Default |
| :--- | :----- | :------------------------------------------------------------------------- | :------- | :------ |
| from | string | ISO-8601 UTC 采购下单时间窗开始时间（包含），例如 2026-06-01T00:00:00Z。   | Yes      |         |
| to   | string | ISO-8601 UTC 采购下单时间窗结束时间（不包含），例如 2026-06-30T00:00:00Z。 | Yes      |         |

---
