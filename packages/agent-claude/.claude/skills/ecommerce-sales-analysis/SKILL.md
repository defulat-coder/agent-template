---
name: ecommerce-sales-analysis
description: 分析电商销售额、退款、净销售额、买家数与渠道表现。用户询问销售趋势、GMV、退款、净销售额或渠道对比时使用。
---

## Usage

本项目通过可执行语义层访问 Toolbox。加载本 Skill 后，必须调用 `mcp__semantic_query__query_business_data`，传入用户原始问题和本目录中的 canonical candidate；不要直接调用底层业务 Toolbox Tool，也不要生成 SQL。语义 Tool 会完成消歧、时间归一、认证查询契约选择、Toolbox 执行和结果来源封装。

## Workflow

1. 读取 `references/ecommerce.yaml`，从中选择 catalog、intent、metric 和 dimension canonical id。
2. 调用 `mcp__semantic_query__query_business_data`；不得提交 Tool 名、SQL、表名、列名、租户或授权范围。
3. 返回 `clarification` 时向用户原样澄清，取得答案后重新解析；不要猜测。
4. 返回 `unsupported` 时说明当前认证查询目录的限制；不要绕过语义层。
5. 返回 `result` 时只依据 Semantic result envelope 回答，并说明指标、UTC `[from, to)` 时间窗、维度、过滤和限制。

## Business semantic catalog

涉及业务术语、指标、维度或枚举取值时，只使用该目录认证的术语和口径。底层认证路径为 `summarize-ecommerce-sales-by-channel`、`summarize-ecommerce-sales-by-day`、`summarize_sales_by_customer_segment`、`summarize_sales_by_region`，仅供理解覆盖范围，不能由模型直接调用。

## Internal certified query paths

### summarize-ecommerce-sales-by-channel

对比 Web、小程序、平台和直播渠道的已结算订单（PAID、FULFILLED、REFUNDED）。
grossSales 为付款总额，refundAmount 为退款总额，netSales 为两者差额，averageOrderValue 为平均单笔净销售额。

#### Parameters

| Name    | Type   | Description                                                            | Required | Default |
| :------ | :----- | :--------------------------------------------------------------------- | :------- | :------ |
| from    | string | ISO-8601 UTC 销售时间窗开始时间（包含），例如 2026-06-01T00:00:00Z。   | Yes      |         |
| to      | string | ISO-8601 UTC 销售时间窗结束时间（不包含），例如 2026-06-02T00:00:00Z。 | Yes      |         |
| channel | string | 可选的认证渠道过滤值；ALL 表示返回全部渠道。                           | No       | `ALL`   |

---

### summarize-ecommerce-sales-by-day

按付款日汇总已结算订单（PAID、FULFILLED、REFUNDED）的销售表现。
grossSales 为 paidTotal 之和，refundAmount 为 refundedTotal 之和，netSales = grossSales - refundAmount。
返回每日付款订单数和去重买家数，适用于有界 UTC 销售趋势分析。

#### Parameters

| Name | Type   | Description                                                            | Required | Default |
| :--- | :----- | :--------------------------------------------------------------------- | :------- | :------ |
| from | string | ISO-8601 UTC 销售时间窗开始时间（包含），例如 2026-06-01T00:00:00Z。   | Yes      |         |
| to   | string | ISO-8601 UTC 销售时间窗结束时间（不包含），例如 2026-06-02T00:00:00Z。 | Yes      |         |

---

### summarize_sales_by_customer_segment

按合成客户分群汇总已结算订单（PAID、FULFILLED、REFUNDED）的销售表现。
customerSegment 使用数据库枚举值 NEW、ACTIVE、VIP、AT_RISK；grossSales、refundAmount、netSales 与 averageOrderValue 口径和销售趋势 Tool 一致。

#### Parameters

| Name            | Type   | Description                                                            | Required | Default |
| :-------------- | :----- | :--------------------------------------------------------------------- | :------- | :------ |
| from            | string | ISO-8601 UTC 销售时间窗开始时间（包含），例如 2026-06-01T00:00:00Z。   | Yes      |         |
| to              | string | ISO-8601 UTC 销售时间窗结束时间（不包含），例如 2026-06-02T00:00:00Z。 | Yes      |         |
| customerSegment | string | 可选的认证客户分群过滤值；ALL 表示返回全部分群。                       | No       | `ALL`   |

---

### summarize_sales_by_region

按客户大区汇总已结算订单（PAID、FULFILLED、REFUNDED）的销售表现。
grossSales 为付款总额，refundAmount 为退款总额，netSales 为两者差额，averageOrderValue 为平均单笔净销售额。
区域来自合成客户档案 customer.region，仅适用于有界 UTC 付款时间窗，不返回客户联系方式或明细。

#### Parameters

| Name   | Type   | Description                                                            | Required | Default |
| :----- | :----- | :--------------------------------------------------------------------- | :------- | :------ |
| from   | string | ISO-8601 UTC 销售时间窗开始时间（包含），例如 2026-06-01T00:00:00Z。   | Yes      |         |
| to     | string | ISO-8601 UTC 销售时间窗结束时间（不包含），例如 2026-06-02T00:00:00Z。 | Yes      |         |
| region | string | 可选的认证大区过滤值；ALL 表示返回全部大区。                           | No       | `ALL`   |

---
