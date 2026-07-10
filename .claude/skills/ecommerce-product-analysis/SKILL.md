---
name: ecommerce-product-analysis
description: 按销量、商品销售总额和退款调整后的净商品销售额分析商品表现。用户询问商品排行、畅销商品、品类表现或选品分析时使用。
---

## Usage

本项目已经把下列 Toolbox 能力注册为 Host-managed typed tools。加载本 skill 后，直接调用同名 Tool；不要绕过 MCP Host 直连数据库。官方生成器同时产出的直连脚本不会安装到 Agent 的 skill 目录。

## Workflow

1. 要求或确认不超过 31 天的 UTC `[from, to)` 时间窗，并设置有界 `limit`。
2. 调用 `list-ecommerce-top-products` 获取商品排行。
3. 同时解释销量、毛商品销售额与退款分摊后的净商品销售额。
4. 不从排行结果推断库存、利润或转化率；当前 Tool 没有这些字段。

## Available Toolbox tools

### list-ecommerce-top-products

按已支付销量、商品销售总额和净商品销售额对合成电商商品进行排行。
订单级退款按商品金额比例分摊，不包含运费。

#### Parameters

| Name  | Type    | Description                                 | Required | Default |
| :---- | :------ | :------------------------------------------ | :------- | :------ |
| from  | string  | ISO-8601 UTC 销售时间窗开始时间（包含）。   | Yes      |         |
| to    | string  | ISO-8601 UTC 销售时间窗结束时间（不包含）。 | Yes      |         |
| limit | integer | 最多返回的商品数量。                        | No       | `20`    |

---
