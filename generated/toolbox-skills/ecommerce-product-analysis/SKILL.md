---
name: ecommerce-product-analysis
description: 按销量、商品销售总额和退款调整后的净商品销售额分析商品表现。用户询问商品排行、畅销商品、品类表现或选品分析时使用。
---

## Usage

All scripts can be executed using Node.js. Replace `<param_name>` and `<param_value>` with actual values.

**Bash:**
`node <skill_dir>/scripts/<script_name>.js '{"<param_name>": "<param_value>"}'`

**PowerShell:**
`node <skill_dir>/scripts/<script_name>.js '{\"<param_name>\": \"<param_value>\"}'`

1. 要求或确认不超过 31 天的 UTC `[from, to)` 时间窗，并设置有界 `limit`。
2. 调用 `list-ecommerce-top-products` 获取商品排行。
3. 同时解释销量、毛商品销售额与退款分摊后的净商品销售额；这两个销售额都不包含运费。
4. 不从排行结果推断库存、利润或转化率；当前 Tool 没有这些字段。


## Scripts


### list-ecommerce-top-products

按已结算订单的销量、grossMerchandiseSales 和 netMerchandiseSales 对合成电商商品排行。
订单级 refundedTotal 按商品 lineTotal 占 paidTotal 的比例分摊；商品销售额不包含运费。


#### Parameters

| Name | Type | Description | Required | Default |
| :--- | :--- | :--- | :--- | :--- |
| from | string | ISO-8601 UTC 销售时间窗开始时间（包含），例如 2026-06-01T00:00:00Z。 | Yes |  |
| to | string | ISO-8601 UTC 销售时间窗结束时间（不包含），例如 2026-06-02T00:00:00Z。 | Yes |  |
| limit | integer | 最多返回的商品数量。 | No | `20` |


---

