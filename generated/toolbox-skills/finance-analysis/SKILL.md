---
name: finance-analysis
description: 分析经营财务概览、支付方式、退款原因、发票异常和渠道结算差异。用户询问收入质量、收退款、开票或对账时使用。
---

## Usage

All scripts can be executed using Node.js. Replace `<param_name>` and `<param_value>` with actual values.

**Bash:**
`node <skill_dir>/scripts/<script_name>.js '{"<param_name>": "<param_value>"}'`

**PowerShell:**
`node <skill_dir>/scripts/<script_name>.js '{\"<param_name>\": \"<param_value>\"}'`

1. 先确认用户关注的业务时间窗和财务口径。
2. 调用 `summarize_finance_overview` 建立收入、退款与净额概览。
3. 支付结构问题调用 `summarize_payment_methods`，退款问题调用 `summarize_refunds_by_reason`。
4. 开票排查调用 `list_invoice_exceptions`，渠道对账调用 `reconcile_channel_settlements`。
5. 严格区分销售、实收、退款、发票与渠道结算；不要把经营指标描述成法定财务报表。


## Scripts


### list_invoice_exceptions

分页返回明确 UTC 开票时间窗内存在状态异常、金额差异或截至 to 已逾期的合成发票。
mismatchAmount 是带方向的原始差额，invoiceMismatchAmount 是其绝对值；结果按绝对差额、开票时间和发票 ID 稳定排序。


#### Parameters

| Name | Type | Description | Required | Default |
| :--- | :--- | :--- | :--- | :--- |
| from | string | ISO-8601 UTC 开票时间窗开始时间（包含），例如 2026-06-01T00:00:00Z。 | Yes |  |
| to | string | ISO-8601 UTC 开票时间窗结束时间（不包含），例如 2026-06-30T00:00:00Z。 | Yes |  |
| limit | integer | 最多返回的异常发票数量。 | No | `50` |
| offset | integer | 从稳定排序结果中跳过的异常发票数量；首页传 0。 | No | `0` |


---

### reconcile_channel_settlements

按渠道和结算状态对账明确 UTC 结算周期开始时间窗内的毛额、退款、手续费、预期结算、实际结算和差异。
settlementRefundAmount 和 differenceAmount 均来自 FinanceSettlement，不等同于 FinanceRefund 退款流水或发票差异。
PENDING 记录尚无实际结算，settledAmount 和 differenceAmount 返回 null。


#### Parameters

| Name | Type | Description | Required | Default |
| :--- | :--- | :--- | :--- | :--- |
| from | string | ISO-8601 UTC 结算周期开始时间窗的起点（包含），例如 2026-06-01T00:00:00Z。 | Yes |  |
| to | string | ISO-8601 UTC 结算周期开始时间窗的终点（不包含），例如 2026-06-30T00:00:00Z。 | Yes |  |


---

### summarize_finance_overview

汇总明确 UTC 时间窗内已结算订单、支付、退款和发票的经营财务概览。
grossSales 是订单原支付额，refundAmount 来自 FinanceRefund，netCollected = capturedPayments - refundAmount；这些经营指标不是法定财务报表。


#### Parameters

| Name | Type | Description | Required | Default |
| :--- | :--- | :--- | :--- | :--- |
| from | string | ISO-8601 UTC 财务时间窗开始时间（包含），例如 2026-06-01T00:00:00Z。 | Yes |  |
| to | string | ISO-8601 UTC 财务时间窗结束时间（不包含），例如 2026-06-30T00:00:00Z。 | Yes |  |


---

### summarize_payment_methods

按支付方式汇总明确 UTC 财务事件时间窗内的支付笔数、支付金额、已完成退款和净实收。
capturedPayments 按 paidAt 统计支付；refundAmount 按 FinanceRefund.requestedAt 统计已完成退款并通过 orderId 归属支付方式。


#### Parameters

| Name | Type | Description | Required | Default |
| :--- | :--- | :--- | :--- | :--- |
| from | string | ISO-8601 UTC 财务事件时间窗开始时间（包含），例如 2026-06-01T00:00:00Z。 | Yes |  |
| to | string | ISO-8601 UTC 财务事件时间窗结束时间（不包含），例如 2026-06-30T00:00:00Z。 | Yes |  |


---

### summarize_refunds_by_reason

按退款原因汇总明确 UTC 申请时间窗内的退款笔数、完成金额和平均处理时长。
refundAmount 只统计 status = COMPLETED 的 FinanceRefund；processingHours 来自合成退款流程记录。


#### Parameters

| Name | Type | Description | Required | Default |
| :--- | :--- | :--- | :--- | :--- |
| from | string | ISO-8601 UTC 退款申请时间窗开始时间（包含），例如 2026-06-01T00:00:00Z。 | Yes |  |
| to | string | ISO-8601 UTC 退款申请时间窗结束时间（不包含），例如 2026-06-30T00:00:00Z。 | Yes |  |


---

