---
name: ecommerce-product-analysis
description: Ranks ecommerce products by units, gross merchandise sales, and refund-adjusted net merchandise sales. Use when the user asks for product ranking, best sellers, category performance, or merchandising analysis.
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

Rank synthetic ecommerce products by paid quantity, gross merchandise sales, and net merchandise sales.
Order-level refunds are allocated proportionally to merchandise; shipping is excluded.

#### Parameters

| Name  | Type    | Description                                | Required | Default |
| :---- | :------ | :----------------------------------------- | :------- | :------ |
| from  | string  | Inclusive ISO-8601 UTC sales window start. | Yes      |         |
| to    | string  | Exclusive ISO-8601 UTC sales window end.   | Yes      |         |
| limit | integer | Maximum number of products to return.      | No       | `20`    |

---
