---
name: ecommerce-fulfillment-operations
description: Finds paid but unfulfilled ecommerce orders and supports fulfillment exception investigation. Use when the user asks about fulfillment backlog, waiting time, delayed orders, or operational exceptions.
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

### list-ecommerce-fulfillment-exceptions

List paid synthetic ecommerce orders that have not yet been fulfilled in a bounded UTC time window.
Use this read-only tool for fulfillment-operations validation.


#### Parameters

| Name | Type | Description | Required | Default |
| :--- | :--- | :--- | :--- | :--- |
| from | string | Inclusive ISO-8601 UTC paid-order window start. | Yes |  |
| to | string | Exclusive ISO-8601 UTC paid-order window end and the waiting-time reference. | Yes |  |
| limit | integer | Maximum number of fulfillment exceptions to return. | No | `50` |


---

