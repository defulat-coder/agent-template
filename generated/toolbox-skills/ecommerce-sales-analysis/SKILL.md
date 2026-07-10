---
name: ecommerce-sales-analysis
description: 分析电商销售额、退款、净销售额、买家数与渠道表现。用户询问销售趋势、GMV、退款、净销售额或渠道对比时使用。
---

## Usage

All scripts can be executed using Node.js. Replace `<param_name>` and `<param_value>` with actual values.

**Bash:**
`node <skill_dir>/scripts/<script_name>.js '{"<param_name>": "<param_value>"}'`

**PowerShell:**
`node <skill_dir>/scripts/<script_name>.js '{\"<param_name>\": \"<param_value>\"}'`

1. 要求或确认不超过 31 天的 UTC `[from, to)` 时间窗。
2. 先调用 `summarize-ecommerce-sales-by-day` 判断趋势和异常日期。
3. 需要渠道归因时，再调用 `summarize-ecommerce-sales-by-channel`。
4. 明确区分 `grossSales`、`refundAmount` 与 `netSales`，不要把退款前销售额描述成实际收入。


## Scripts


### summarize-ecommerce-sales-by-channel

对比 Web、小程序、平台和直播渠道的合成电商销售表现。
用于有界的只读渠道经营表现分析。


#### Parameters

| Name | Type | Description | Required | Default |
| :--- | :--- | :--- | :--- | :--- |
| from | string | ISO-8601 UTC 销售时间窗开始时间（包含）。 | Yes |  |
| to | string | ISO-8601 UTC 销售时间窗结束时间（不包含）。 | Yes |  |


---

### summarize-ecommerce-sales-by-day

按日汇总合成电商数据的销售总额、退款、净销售额、订单数和买家数。
用于在明确的 ISO-8601 UTC 时间窗内进行有界的只读销售趋势分析。


#### Parameters

| Name | Type | Description | Required | Default |
| :--- | :--- | :--- | :--- | :--- |
| from | string | ISO-8601 UTC 销售时间窗开始时间（包含）。 | Yes |  |
| to | string | ISO-8601 UTC 销售时间窗结束时间（不包含）。 | Yes |  |


---

