# 智能问数落地

## 结论

智能问数的生产实现不应是“把表结构塞给模型，再让模型写 SQL”。它应让模型在受治理的业务语义模型中选择指标、维度、取值和受控查询路径；数据库只执行经过认证的查询。

当前项目采用适用于 PostgreSQL + Google MCP Toolbox 的第一阶段实现：**业务语义目录 + 按任务拆分的 Toolbox Tool + Agent Skill**。它提供可靠、可审计的问数能力，同时不把当前模板锁死到 AlloyDB、Looker、dbt 或 Cube。

```text
自然语言问题
  -> 业务 Skill（路由与澄清）
  -> 业务语义目录（术语、口径、值、限制）
  -> 认证的 Toolbox Tool（prepared statement）
  -> PostgreSQL 只读查询
  -> 带指标/时间窗/维度说明的答案
```

## 当前已集成

[ecommerce.yaml](./semantic/ecommerce.yaml) 是合成电商业务的语义目录，[ecommerce-evaluation.yaml](./semantic/ecommerce-evaluation.yaml) 是问数路由与歧义处理的 golden cases。它们会被 `pnpm toolbox:check:semantic` 校验，并随四个 Claude/Eve 业务 Skill 生成到 `references/ecommerce-semantic-catalog.yaml`。

| 用户说法               | canonical 术语与实际字段/取值                                                      | 认证 Tool                               |
| ---------------------- | ---------------------------------------------------------------------------------- | --------------------------------------- |
| “近30天华东 GMV”       | `gross_sales`；`EcommerceCustomer.region = 华东`；付款时间 `EcommerceOrder.paidAt` | `summarize_sales_by_region`             |
| “VIP 退款后销售额”     | `customer_segment = VIP`；`net_sales`                                              | `summarize_sales_by_customer_segment`   |
| “直播客单价”           | `sales_channel = LIVE_STREAM`；`average_order_value`                               | `summarize-ecommerce-sales-by-channel`  |
| “美妆个护商品净销售额” | `product_category = 美妆个护`；`net_merchandise_sales`                             | `summarize_merchandise_by_category`     |
| “待履约订单”           | `status = PAID AND fulfilledAt IS NULL`                                            | `list-ecommerce-fulfillment-exceptions` |

`营收`、`收入` 和未限定的 `订单数` 都是歧义术语：当前 Agent 必须追问，不能把它们擅自等同于 GMV、净销售额或会计收入。

## 市场上的三种成熟形态

1. **认证查询目录（当前实现）**：为关键用户旅程定义结果型 MCP Tool；Tool 描述和语义目录提供术语解释，SQL 是预定义 prepared statement。适用于 PostgreSQL、业务范围可控、需要快速安全上线的场景。

2. **独立语义层 / context layer**：Looker、dbt Semantic Layer、Cube 等将指标、维度、关联、访问规则和 lineage 版本化；BI、嵌入式分析和 Agent 共享同一模型。它解决多报表、多团队、多 Agent 的指标漂移问题。

3. **数据库内 NL2SQL**：Google AlloyDB AI NL 通过 `nl_config` 关联 schema objects、示例和上下文，再由 `alloydb-ai-nl` Tool 执行自然语言查询。它需要 AlloyDB、受控语义配置和 Parameterized Secure Views；不应直接替换当前 PostgreSQL 的受控 Tool。

## 生产必备治理

- **一个术语，一个口径**：指标必须有粒度、公式、纳入/排除状态、时间字段、返回字段和所有者。
- **一个维度，一个值表**：业务同义词映射到 canonical id，再映射到真实字段和值；不要让模型猜枚举或拼接 where 条件。
- **身份不是模型参数**：组织、地区、角色、行列权限由可信身份注入，并由 RLS 或等效访问控制强制执行。
- **答案可追溯**：回答中输出指标、时间窗、维度、过滤范围、数据新鲜度和限制；需要时可回链到语义目录版本。
- **golden evaluation**：每个领域维护正常问题、同义词、部分退款、空结果、越权和歧义问题；每次模型、Tool 或口径变更都回归。
- **观测与人工闭环**：记录未知术语、澄清率、Tool 选择、空结果、结果行数、延迟和用户纠正；由数据负责人审核后再写回目录。

## 当前边界与下一阶段

当前 Tool 支持按日、渠道、区域、客户分群、品类、商品、订单与履约进行认证分析。它不会把“华东 + 直播 + VIP + 某品类”的任意组合编译成 SQL，这是刻意的安全边界。

当一个业务域稳定地需要三维以上的自由组合时，再新增一个 **semantic query compiler**：输入只能是目录中的 `metric`、`dimensions`、受限 `filters`、`timeWindow`、排序和 `limit`；compiler 通过字段白名单和预聚合视图生成参数化 SQL，并在执行前注入可信身份范围。不要开放 SQL 字符串、表名、列名或自由表达式。

若未来迁移到 AlloyDB，可以将同一份业务术语、值映射、问题样例和权限规则迁移到 `nl_config`，并用 Parameterized Secure Views / authenticated parameters 强制租户范围；这应作为独立迁移决策，而不是在 PostgreSQL 上模拟不受控 NL2SQL。

## 官方参考

- [MCP Toolbox Style Guide](https://mcp-toolbox.dev/reference/style-guide/)
- [AlloyDB AI NL Toolbox Tool](https://mcp-toolbox.dev/integrations/alloydb/tools/alloydb-ai-nl/)
- [LookML semantic model](https://docs.cloud.google.com/looker/docs/what-is-lookml)
- [Looker modeling for AI](https://cloud.google.com/looker-modeling)
- [Cube AI context layer](https://cube.dev/product/ai-context-layer)
