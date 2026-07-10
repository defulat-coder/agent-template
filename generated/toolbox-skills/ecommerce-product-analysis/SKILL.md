---
name: ecommerce-product-analysis
description: Ranks ecommerce products by units, gross merchandise sales, and refund-adjusted net merchandise sales. Use when the user asks for product ranking, best sellers, category performance, or merchandising analysis.
---

## Usage

All scripts can be executed using Node.js. Replace `<param_name>` and `<param_value>` with actual values.

**Bash:**
`node <skill_dir>/scripts/<script_name>.js '{"<param_name>": "<param_value>"}'`

**PowerShell:**
`node <skill_dir>/scripts/<script_name>.js '{\"<param_name>\": \"<param_value>\"}'`


## Scripts


### list-ecommerce-top-products

Rank synthetic ecommerce products by paid quantity, gross merchandise sales, and net merchandise sales.
Order-level refunds are allocated proportionally to merchandise; shipping is excluded.


#### Parameters

| Name | Type | Description | Required | Default |
| :--- | :--- | :--- | :--- | :--- |
| from | string | Inclusive ISO-8601 UTC sales window start. | Yes |  |
| to | string | Exclusive ISO-8601 UTC sales window end. | Yes |  |
| limit | integer | Maximum number of products to return. | No | `20` |


---

