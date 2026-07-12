---
name: supply-chain-operations
description: 分析库存健康、缺货风险、仓库库存、采购支出、供应商表现和采购单异常。用户询问补货、库存或采购运营时使用。
---

## Usage

本项目的 Claude 与 Eve runtime 已分别通过原生 MCP Client 直连 Toolbox。加载本 Skill 后，调用当前 runtime 对应的 Toolbox MCP Tool；不要绕过 Toolbox 执行任意 SQL。官方生成器产出的数据库直连脚本不会安装到 Agent 的 Skill 目录。

## Workflow

1. 先确认库存快照或采购时间窗，并明确仓库、SKU 或供应商范围。
2. 库存全局判断先调用 `mcp__toolbox__summarize_inventory_health`，风险排查调用 `mcp__toolbox__list_stockout_risks`。
3. 仓库对比调用 `mcp__toolbox__summarize_inventory_by_warehouse`。
4. 采购分析调用 `mcp__toolbox__summarize_procurement_spend` 和 `mcp__toolbox__summarize_supplier_performance`，具体异常调用 `mcp__toolbox__list_purchase_order_exceptions`。
5. 区分可售、占用、在途和安全库存；不要用单一库存快照推断历史缺货。

## Business semantic catalog

涉及业务术语、指标、维度或枚举取值时，先读取 `references/supply-chain.yaml`。只使用其中认证的术语、口径和 Tool；遇到标记为 `clarify` 的术语，先向用户澄清，不要猜测或生成任意 SQL。

## Available Toolbox tools

### `mcp__toolbox__list_purchase_order_exceptions`

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

### `mcp__toolbox__list_stockout_risks`

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

### `mcp__toolbox__summarize_inventory_by_warehouse`

按仓库汇总明确 UTC 快照时间窗内的 SKU 数、在库、可用、在途、风险 SKU 和库存金额。
averageDailyCapacityUtilization 使用时间窗内 onHand 总和 /（capacityUnits \* 快照自然日数）；同一仓库多日快照分别计入。

#### Parameters

| Name | Type   | Description                                                                | Required | Default |
| :--- | :----- | :------------------------------------------------------------------------- | :------- | :------ |
| from | string | ISO-8601 UTC 库存快照时间窗开始时间（包含），例如 2026-06-01T00:00:00Z。   | Yes      |         |
| to   | string | ISO-8601 UTC 库存快照时间窗结束时间（不包含），例如 2026-06-30T00:00:00Z。 | Yes      |         |

---

### `mcp__toolbox__summarize_inventory_health`

按库存风险等级汇总明确 UTC 快照时间窗内的 SKU、在库、占用、在途、安全库存和库存金额。
availableUnits = onHand - reserved；inventoryValue = onHand \* unitCost，单个 SKU 的多日快照会分别计入。

#### Parameters

| Name | Type   | Description                                                                | Required | Default |
| :--- | :----- | :------------------------------------------------------------------------- | :------- | :------ |
| from | string | ISO-8601 UTC 库存快照时间窗开始时间（包含），例如 2026-06-01T00:00:00Z。   | Yes      |         |
| to   | string | ISO-8601 UTC 库存快照时间窗结束时间（不包含），例如 2026-06-30T00:00:00Z。 | Yes      |         |

---

### `mcp__toolbox__summarize_procurement_spend`

按供应商品类汇总明确 UTC 下单时间窗内的采购单数、SKU 数、采购金额、延期单数和平均延期天数。
已取消采购单不进入汇总；amount 是合成采购订单金额，不代表已付款现金支出或会计成本确认。

#### Parameters

| Name | Type   | Description                                                                | Required | Default |
| :--- | :----- | :------------------------------------------------------------------------- | :------- | :------ |
| from | string | ISO-8601 UTC 采购下单时间窗开始时间（包含），例如 2026-06-01T00:00:00Z。   | Yes      |         |
| to   | string | ISO-8601 UTC 采购下单时间窗结束时间（不包含），例如 2026-06-30T00:00:00Z。 | Yes      |         |

---

### `mcp__toolbox__summarize_supplier_performance`

按供应商汇总明确 UTC 采购下单时间窗内的采购额、延期单、实际准时率，并返回供应商档案评级和目标准时率。
已取消采购单不进入汇总；actualOnTimeRate 以 receivedAt <= expectedAt 的已收货采购单为分母，未收货单不计入该比例。

#### Parameters

| Name | Type   | Description                                                                | Required | Default |
| :--- | :----- | :------------------------------------------------------------------------- | :------- | :------ |
| from | string | ISO-8601 UTC 采购下单时间窗开始时间（包含），例如 2026-06-01T00:00:00Z。   | Yes      |         |
| to   | string | ISO-8601 UTC 采购下单时间窗结束时间（不包含），例如 2026-06-30T00:00:00Z。 | Yes      |         |

---
