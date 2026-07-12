# 智能问数落地

## 结论

智能问数的生产实现不应是“把表结构塞给模型，再让模型写 SQL”。它应让模型在受治理的业务语义模型中选择指标、维度、取值和受控查询路径；数据库只执行经过认证的查询。

当前项目采用适用于 PostgreSQL + Google MCP Toolbox 的第一阶段实现：**业务语义目录 + 确定性语义解析器 + 按任务拆分的认证 Toolbox Tool + Agent Skill**。模型只提交结构化候选，解析器负责校验目录、消歧、规范化 UTC 时间窗、选择查询契约并生成结果 envelope；它不把当前模板锁死到 AlloyDB、Looker、dbt 或 Cube。

本文是后续智能问数和业务 Toolbox Tool 的**规范性设计标准**。新增能力必须先按本文选择执行层级、完成对应准入项，再修改 `tools.yaml`；不能从“需要一个 SQL”或“模型能否自己组合”反推设计。

```text
自然语言问题
  -> 业务 Skill（提出 catalog / intent / terms 候选）
  -> runtime-local query_business_data
  -> @agent-template/semantic-query（校验、澄清、计划、结果投影）
  -> 认证的 Toolbox Tool（runtime-owned MCP Client）
  -> PostgreSQL 只读查询
  -> 带 queryId / planHash / 口径 / 时间窗 / 限制的结果 envelope
```

## 当前已集成

`semantic/` 目前按电商、财务、物流、供应链和营销维护独立业务语义目录及对应 `*-evaluation.yaml` resolver golden cases。它们会被 `pnpm toolbox:check:semantic` 按 Capability Pack 双向校验，并在固定 candidate 与 fake certified rows 下回归确定性 resolution；该门禁不冒充模型候选提取或真实数据库 E2E。生成器同时产出 runtime 使用的类型化目录，以及 Claude/Eve 业务 Skill 的 `references/<catalog>.yaml`。

每个认证业务 Tool 还必须有一个 `queryContracts` 条目。生成门禁验证它与指标、维度、参数和 Tool 的引用关系；运行时只会执行当前 Capability Profile 允许且目录认证的 contract。`query_business_data` 返回严格结果 envelope，原始 Toolbox 行会按 `resultFields` 投影，未知字段不会穿透到模型。

业务 Profile 不再把原始业务 Tool 直接暴露给模型。Claude 使用 SDK 内嵌 MCP Tool，Eve 使用动态 Tool；两者各自持有底层 Toolbox MCP Client。平台观测 Tool 仍可按 Profile 直接可见。模型可见性只减少绕过路径，生产授权仍由 Toolbox OIDC、Tool scope 和数据库权限执行。

| 用户说法               | canonical 术语与实际字段/取值                                                                                          | 认证 Tool                               |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| “近30天华东 GMV”       | `gross_sales`；`ecommerce_fixture.EcommerceCustomer.region = 华东`；付款时间 `ecommerce_fixture.EcommerceOrder.paidAt` | `summarize_sales_by_region`             |
| “VIP 退款后销售额”     | `customer_segment = VIP`；`net_sales`                                                                                  | `summarize_sales_by_customer_segment`   |
| “直播客单价”           | `sales_channel = LIVE_STREAM`；`average_order_value`                                                                   | `summarize-ecommerce-sales-by-channel`  |
| “美妆个护商品净销售额” | `product_category = 美妆个护`；`net_merchandise_sales`                                                                 | `summarize_merchandise_by_category`     |
| “待履约订单”           | `status = PAID AND fulfilledAt IS NULL`                                                                                | `list-ecommerce-fulfillment-exceptions` |

`营收`、`收入` 和未限定的 `订单数` 都是歧义术语：当前 Agent 必须追问，不能把它们擅自等同于 GMV、净销售额或会计收入。

## 生产分层与选择逻辑

业务语义治理是所有层的共同地基；它不是可选的“提示词资料”。指标、维度、值映射、时间语义、访问范围、歧义词、数据负责人和版本必须先存在于目录中。执行层按照能力和风险从低到高选择；不能因为“想支持自由提问”直接跳到自由 SQL。

| 层级                          | 适用条件                                                                   | 必须满足的要求                                                                                                                                                                | 本项目决策          |
| ----------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| 1. 认证业务查询目录           | 问题是稳定的关键用户旅程，结果形态可预先定义                               | runtime-local 语义入口；确定性目录解析；一个结果型 Tool；参数化 SQL；有界时间/行数；golden cases、可信身份范围与结果 envelope                                                 | **已落地默认路径**  |
| 2. Semantic query compiler    | 同一业务域持续出现三维及以上的受控组合，且指标、关联、维度和过滤项均可枚举 | 接受结构化 `metric/dimensions/filters/timeWindow`，只从白名单编译参数化 SQL；定义 join graph、预聚合/成本上限、访问注入和结果对账；先新增 ADR                                 | 暂不引入            |
| 3. 独立语义层 / context layer | BI、嵌入式分析和多个 Agent 需要共享同一指标、关系、lineage 与权限模型      | 选定一个指标事实源；将本目录映射到 Looker、dbt Semantic Layer、Cube 等；Toolbox 调用语义层的受控查询，不重复维护指标公式                                                      | 按跨团队需求评估    |
| 4. 数据库内 NL2SQL            | 已迁移 AlloyDB，且确实需要数据库原生自然语言生成 SQL                       | 每个应用域配置 `nl_config` 的 schema objects、样例和 context；使用 Parameterized Secure Views，并通过 Authenticated/Bound Parameters 注入身份范围；单独做安全、成本和迁移 ADR | PostgreSQL 模板禁止 |

第 2、3、4 层不是“功能越多越好”的升级任务。第 2 层解决受控组合，第 3 层解决跨消费者的语义一致性，第 4 层是特定数据库产品能力；它们可以分别成为独立决策，但都不能绕过语义目录和可信身份授权。

LookML 的做法是把维度、聚合、计算和关系建模为可生成 SQL 的业务模型；业务用户只选择指标、维度和过滤条件。当前目录和未来 compiler 应保持同一思路，而不是把表/列暴露给模型。[LookML 官方说明](https://docs.cloud.google.com/looker/docs/what-is-lookml)

Google Toolbox 的 `alloydb-ai-nl` 要求 `nl_config` 关联 schema objects、样例和 context，并建议用 Authenticated 或 Bound Parameters 保护 Parameterized Secure Views 中对 LLM 不可见的身份参数。[AlloyDB AI NL 官方说明](https://mcp-toolbox.dev/integrations/alloydb/tools/alloydb-ai-nl/)

## Tool 分类与准入矩阵

不要用“新增 Tool”这一种笼统规则处理所有能力。Tool 的调用方和验证方式不同，必须先归类；这使后续设计的 interface 清晰、校验集中，避免把平台运维能力误套业务问数的义务。

| Tool 类别                       | 例子                                        | 必须有                                                                                                    | 不得假设                                             |
| ------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 平台只读运维 Tool               | Agent run、Template event、数据库健康与观测 | outcome 描述、只读 annotations、有界参数、runtime capability profile、native 执行验证                     | 它拥有业务指标、业务 Skill 或业务语义目录            |
| 认证业务问数 Tool               | 销售、品类、履约、客户分群分析              | 第 1 层语义目录记录、问题模式、golden cases、数据负责人、Toolbox/Claude/Eve/实际 Skill 同步、指标结果对账 | Toolset 即运行时授权；模型可以选择表、列、租户或 SQL |
| Semantic query compiler         | 受控的多维指标组合                          | 第 2 层全部要求、结构化 request schema、字段与 join 白名单、成本/结果上限、ADR、端到端验收                | 接受 SQL 字符串、自由表达式、模型传入的身份范围      |
| 外部语义层或 AlloyDB AI NL Tool | Looker 查询、`alloydb-ai-nl`                | 对应平台的治理配置、身份传递、版本同步、回归与迁移 ADR                                                    | 仅凭 Tool 描述或 prompt 就能获得生产级语义与权限     |

Toolset 是 Skill 生成和业务分组，不是运行时授权。Capability Pack 原子绑定 Toolset、scope、语义目录与 Skill，`AGENT_CAPABILITY_PROFILE` 只能组合完整 Pack；共享编译结果把业务 Tool 保留为 runtime 可执行面，但从 Claude/Eve 的模型可见面移除，只暴露 `query_business_data`。真正的授权 interface 是 Toolbox OIDC、Tool scope、数据库权限与 RLS/等效控制。不能把 Toolset、Pack、解析器或模型可见范围描述成数据库最小权限控制。

## 后续业务 Tool 的强制准入要求

每个认证业务问数 Tool 在进入 `tools.yaml` 前，必须满足以下条件：

1. **先语义，后 SQL**：目录中已有 canonical id、中文业务名/同义词、定义与公式、粒度、纳入/排除状态、时间字段、真实表字段与枚举值、返回字段、数据负责人、敏感性和数据新鲜度。歧义词必须声明为澄清而非默认猜测。
2. **选择正确层级**：稳定结果型问题使用第 1 层；只有有持续、已验证的三维以上组合需求时才提出第 2 层 ADR；跨消费者一致性才引入第 3 层；PostgreSQL 上不得用 prompt 模拟第 4 层。
3. **收窄 Tool interface**：Tool 围绕关键用户旅程和结果设计，不镜像表 CRUD；只接受类型化的业务参数；时间窗、排序、分页和 `limit` 必须有硬上限；不接受 SQL、表名、列名或自由表达式。按 Google Toolbox 指引，Toolset 以 capability/persona 分组，目标为 5–8 个 Tool，服务端尽量不超过 40 个 Tool，以减少 context rot。[Toolbox Style Guide](https://mcp-toolbox.dev/reference/style-guide/)
4. **权限不由模型决定**：租户、组织、区域、角色和列级范围由认证身份注入，数据库 RLS 或等效机制最终强制；Tool 描述、Skill、参数校验和数据库角色之间不得出现更宽的访问路径。
5. **时间与口径可执行**：明确业务时区、`[from, to)` 边界、数据字段的数据库时间类型和转换规则；Tool 输入的 UTC 承诺必须与数据库字段语义一致，不能依赖部署 session 的隐式时区转换。
6. **完整投影与验证**：在 Capability Pack 中同步 Toolset、scope、Profile 组合、Skill、语义目录和 resolver golden cases；共享生成器产出 Claude/Eve 运行面和类型化 runtime 目录，本地完成静态语义门禁、resolver evaluation、runtime adapter 测试、官方 Skill 漂移校验和 native Tool 执行验收。默认不使用 Docker；只有用户明确要求容器集成验证时才运行 Docker 门禁。
7. **可观察、可回滚**：记录 `queryId`、catalog/version、contract、Tool、`planHash`、澄清、空结果、行数、耗时、错误和用户纠正；事件只携带元数据，不复制业务行。指标定义变更必须有目录版本与兼容性说明，影响既有答案时通过 ADR/迁移说明评审。

认证查询的空结果不是错误，也不能只返回“无数据”。Agent 回答必须给出 UTC 时间窗、权限/capability、实体标识或分页越界等可操作检查建议；列表 Tool 返回稳定排序与 `totalCount`，调用方据此计算下一页位置。

## 生产必备治理

- **一个术语，一个口径**：指标必须有粒度、公式、纳入/排除状态、时间字段、返回字段和所有者。
- **一个维度，一个值表**：业务同义词映射到 canonical id，再映射到真实字段和值；不要让模型猜枚举或拼接 where 条件。
- **身份不是模型参数**：组织、地区、角色、行列权限由可信身份注入，并由 RLS 或等效访问控制强制执行。
- **答案可追溯**：回答中输出指标、时间窗、维度、过滤范围、数据新鲜度和限制；需要时可回链到语义目录版本。
- **分层验证**：每个领域用 resolver golden cases 回归正常问题、同义词、部分退款、空结果、越权和歧义；`pnpm toolbox:verify:local` 再以固定 candidate 串起 semantic plan、原生 MCP Tool 与结果 envelope。模型候选质量另由线上/模型 evaluation 评估，不能拿 resolver oracle 代替。
- **观测与人工闭环**：记录未知术语、澄清率、Tool 选择、空结果、结果行数、延迟和用户纠正；由数据负责人审核后再写回目录。

## 当前边界与下一阶段

当前 `query_business_data` 支持销售、商品、订单、履约、支付退款、发票结算、物流 SLA、库存采购和营销效率等认证分析。它只把模型候选解析成已提交的 `queryContracts` 和 Toolbox prepared statements，不会把任意指标、任意维度和任意跨表组合编译成 SQL，这是刻意的安全边界。

当一个业务域稳定地需要三维以上的自由组合时，再新增一个 **semantic query compiler**：输入只能是目录中的 `metric`、`dimensions`、受限 `filters`、`timeWindow`、排序和 `limit`；compiler 通过字段白名单和预聚合视图生成参数化 SQL，并在执行前注入可信身份范围。不要开放 SQL 字符串、表名、列名或自由表达式。

若未来迁移到 AlloyDB，可以将同一份业务术语、值映射、问题样例和权限规则迁移到 `nl_config`，并用 Parameterized Secure Views / authenticated parameters 强制租户范围；这应作为独立迁移决策，而不是在 PostgreSQL 上模拟不受控 NL2SQL。

## 官方参考

- [MCP Toolbox Style Guide](https://mcp-toolbox.dev/reference/style-guide/)
- [AlloyDB AI NL Toolbox Tool](https://mcp-toolbox.dev/integrations/alloydb/tools/alloydb-ai-nl/)
- [LookML semantic model](https://docs.cloud.google.com/looker/docs/what-is-lookml)
- [Looker modeling for AI](https://cloud.google.com/looker-modeling)
- [Cube AI context layer](https://cube.dev/product/ai-context-layer)
