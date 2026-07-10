---
name: ecommerce-sales-analysis
description: 分析电商销售额、退款、净销售额、买家数与渠道表现。用户询问销售趋势、GMV、退款、净销售额或渠道对比时使用。
---

## Usage

本项目已经把下列 Toolbox 能力注册为 Host-managed typed tools。加载本 skill 后，直接调用同名 Tool；不要绕过 MCP Host 直连数据库。官方生成器同时产出的直连脚本不会安装到 Agent 的 skill 目录。

## Workflow

1. 要求或确认不超过 31 天的 UTC `[from, to)` 时间窗。
2. 先调用 `summarize-ecommerce-sales-by-day` 判断趋势和异常日期。
3. 需要渠道归因时，再调用 `summarize-ecommerce-sales-by-channel`。
4. 指标口径仅包含 `PAID`、`FULFILLED` 和 `REFUNDED` 订单；明确区分 `grossSales`、`refundAmount` 与 `netSales`。
5. 渠道 `averageOrderValue` 是平均单笔净销售额，不要把退款前销售额描述成实际收入。

## Available Toolbox tools

### summarize-ecommerce-sales-by-channel

对比 Web、小程序、平台和直播渠道的已结算订单（PAID、FULFILLED、REFUNDED）。
grossSales 为付款总额，refundAmount 为退款总额，netSales 为两者差额，averageOrderValue 为平均单笔净销售额。

#### Parameters

| Name | Type   | Description                                                            | Required | Default |
| :--- | :----- | :--------------------------------------------------------------------- | :------- | :------ |
| from | string | ISO-8601 UTC 销售时间窗开始时间（包含），例如 2026-06-01T00:00:00Z。   | Yes      |         |
| to   | string | ISO-8601 UTC 销售时间窗结束时间（不包含），例如 2026-06-02T00:00:00Z。 | Yes      |         |

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
