---
name: ecommerce-order-operations
description: Investigates ecommerce orders using bounded operational lists and exact order details. Use when the user asks about order status, customer segment context, a concrete order number, or order-level troubleshooting.
---

## Usage

All scripts can be executed using Node.js. Replace `<param_name>` and `<param_value>` with actual values.

**Bash:**
`node <skill_dir>/scripts/<script_name>.js '{"<param_name>": "<param_value>"}'`

**PowerShell:**
`node <skill_dir>/scripts/<script_name>.js '{\"<param_name>\": \"<param_value>\"}'`


## Scripts


### get-ecommerce-order-detail

Return one synthetic ecommerce order with its customer business context and line items.
Use this tool only when the user provides a concrete orderNumber.


#### Parameters

| Name | Type | Description | Required | Default |
| :--- | :--- | :--- | :--- | :--- |
| orderNumber | string | Concrete ecommerce order number, for example EC20260601001. | Yes |  |


---

### list-ecommerce-orders-in-window

List a bounded operational order view for the synthetic ecommerce dataset.
Customer data is limited to synthetic customer code, segment, and region; no direct contact data is returned.


#### Parameters

| Name | Type | Description | Required | Default |
| :--- | :--- | :--- | :--- | :--- |
| from | string | Inclusive ISO-8601 UTC operational window start. | Yes |  |
| to | string | Exclusive ISO-8601 UTC operational window end. | Yes |  |
| limit | integer | Maximum number of orders to return. | No | `50` |


---

