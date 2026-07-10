---
name: ecommerce-order-operations
description: 通过有界订单列表和精确订单明细排查电商订单。用户询问订单状态、客户分群背景、具体订单号或订单级故障时使用。
---

## Usage

本项目已经把下列 Toolbox 能力注册为 Host-managed typed tools。加载本 skill 后，直接调用同名 Tool；不要绕过 MCP Host 直连数据库。官方生成器同时产出的直连脚本不会安装到 Agent 的 skill 目录。

## Workflow

1. 用户提供订单号时，直接调用 `get-ecommerce-order-detail`，不要先扫描订单列表。
2. 用户询问一段时间的订单时，调用 `list-ecommerce-orders-in-window`，时间窗不超过 31 天且结果有界。
3. 需要继续核查时，只对用户选中的具体订单调用详情 Tool。
4. 返回合成 customer code、segment 和地区即可；不要声称存在联系方式或真实个人信息。

## Available Toolbox tools

### get-ecommerce-order-detail

返回一笔合成电商订单及其客户业务背景和订单项。
仅当用户提供明确的 orderNumber 时使用。

#### Parameters

| Name        | Type   | Description                            | Required | Default |
| :---------- | :----- | :------------------------------------- | :------- | :------ |
| orderNumber | string | 明确的电商订单号，例如 EC20260601001。 | Yes      |         |

---

### list-ecommerce-orders-in-window

返回合成电商数据的有界订单运营视图。
客户数据仅包含合成客户编码、分群和地区，不返回直接联系方式。

#### Parameters

| Name  | Type    | Description                                     | Required | Default |
| :---- | :------ | :---------------------------------------------- | :------- | :------ |
| from  | string  | ISO-8601 UTC 订单运营时间窗开始时间（包含）。   | Yes      |         |
| to    | string  | ISO-8601 UTC 订单运营时间窗结束时间（不包含）。 | Yes      |         |
| limit | integer | 最多返回的订单数量。                            | No       | `50`    |

---
