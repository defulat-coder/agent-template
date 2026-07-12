---
name: finance-analysis
description: 分析经营财务概览、支付方式、退款原因、发票异常和渠道结算差异。用户询问收入质量、收退款、开票或对账时使用。
---

## Usage

本项目通过可执行语义层访问 Toolbox。加载本 Skill 后，必须调用 `mcp__semantic_query__query_business_data`，传入用户原始问题和本目录中的 canonical candidate；不要直接调用底层业务 Toolbox Tool，也不要生成 SQL。语义 Tool 会完成消歧、时间归一、认证查询契约选择、Toolbox 执行和结果来源封装。

## Workflow

1. 读取 `references/finance.yaml`，从中选择 catalog、intent、metric 和 dimension canonical id。
2. 调用 `mcp__semantic_query__query_business_data`；不得提交 Tool 名、SQL、表名、列名、租户或授权范围。
3. 返回 `clarification` 时向用户原样澄清，取得答案后重新解析；不要猜测。
4. 返回 `unsupported` 时说明当前认证查询目录的限制；不要绕过语义层。
5. 返回 `result` 时只依据 Semantic result envelope 回答，并说明指标、UTC `[from, to)` 时间窗、维度、过滤和限制。

## Business semantic catalog

涉及业务术语、指标、维度或枚举取值时，只使用该目录认证的术语和口径。底层认证路径为 `list_invoice_exceptions`、`reconcile_channel_settlements`、`summarize_finance_overview`、`summarize_payment_methods`、`summarize_refunds_by_reason`，仅供理解覆盖范围，不能由模型直接调用。

## Internal certified query paths

### list_invoice_exceptions

分页返回明确 UTC 开票时间窗内存在状态异常、金额差异或截至 to 已逾期的合成发票。
mismatchAmount 是带方向的原始差额，invoiceMismatchAmount 是其绝对值；结果按绝对差额、开票时间和发票 ID 稳定排序。

#### Parameters

| Name   | Type    | Description                                                            | Required | Default |
| :----- | :------ | :--------------------------------------------------------------------- | :------- | :------ |
| from   | string  | ISO-8601 UTC 开票时间窗开始时间（包含），例如 2026-06-01T00:00:00Z。   | Yes      |         |
| to     | string  | ISO-8601 UTC 开票时间窗结束时间（不包含），例如 2026-06-30T00:00:00Z。 | Yes      |         |
| limit  | integer | 最多返回的异常发票数量。                                               | No       | `50`    |
| offset | integer | 从稳定排序结果中跳过的异常发票数量；首页传 0。                         | No       | `0`     |

---

### reconcile_channel_settlements

按渠道和结算状态对账明确 UTC 结算周期开始时间窗内的毛额、退款、手续费、预期结算、实际结算和差异。
settlementRefundAmount 和 differenceAmount 均来自 FinanceSettlement，不等同于 FinanceRefund 退款流水或发票差异。
PENDING 记录尚无实际结算，settledAmount 和 differenceAmount 返回 null。

#### Parameters

| Name | Type   | Description                                                                  | Required | Default |
| :--- | :----- | :--------------------------------------------------------------------------- | :------- | :------ |
| from | string | ISO-8601 UTC 结算周期开始时间窗的起点（包含），例如 2026-06-01T00:00:00Z。   | Yes      |         |
| to   | string | ISO-8601 UTC 结算周期开始时间窗的终点（不包含），例如 2026-06-30T00:00:00Z。 | Yes      |         |

---

### summarize_finance_overview

汇总明确 UTC 时间窗内已结算订单、支付、退款和发票的经营财务概览。
grossSales 是订单原支付额，refundAmount 来自 FinanceRefund，netCollected = capturedPayments - refundAmount；这些经营指标不是法定财务报表。

#### Parameters

| Name | Type   | Description                                                            | Required | Default |
| :--- | :----- | :--------------------------------------------------------------------- | :------- | :------ |
| from | string | ISO-8601 UTC 财务时间窗开始时间（包含），例如 2026-06-01T00:00:00Z。   | Yes      |         |
| to   | string | ISO-8601 UTC 财务时间窗结束时间（不包含），例如 2026-06-30T00:00:00Z。 | Yes      |         |

---

### summarize_payment_methods

按支付方式汇总明确 UTC 财务事件时间窗内的支付笔数、支付金额、已完成退款和净实收。
capturedPayments 按 paidAt 统计支付；refundAmount 按 FinanceRefund.requestedAt 统计已完成退款并通过 orderId 归属支付方式。

#### Parameters

| Name | Type   | Description                                                                | Required | Default |
| :--- | :----- | :------------------------------------------------------------------------- | :------- | :------ |
| from | string | ISO-8601 UTC 财务事件时间窗开始时间（包含），例如 2026-06-01T00:00:00Z。   | Yes      |         |
| to   | string | ISO-8601 UTC 财务事件时间窗结束时间（不包含），例如 2026-06-30T00:00:00Z。 | Yes      |         |

---

### summarize_refunds_by_reason

按退款原因汇总明确 UTC 申请时间窗内的退款笔数、完成金额和平均处理时长。
refundAmount 只统计 status = COMPLETED 的 FinanceRefund；processingHours 来自合成退款流程记录。

#### Parameters

| Name | Type   | Description                                                                | Required | Default |
| :--- | :----- | :------------------------------------------------------------------------- | :------- | :------ |
| from | string | ISO-8601 UTC 退款申请时间窗开始时间（包含），例如 2026-06-01T00:00:00Z。   | Yes      |         |
| to   | string | ISO-8601 UTC 退款申请时间窗结束时间（不包含），例如 2026-06-30T00:00:00Z。 | Yes      |         |

---
