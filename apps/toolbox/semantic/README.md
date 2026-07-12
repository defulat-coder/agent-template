# 业务语义目录

这里保存面向智能问数的可版本化业务语义目录。目录不是数据库 schema 的副本，而是将业务语言映射到经过认证的指标、维度、枚举取值和受控 Toolbox Tool 的契约。

当前按 Capability Pack 维护电商、财务、物流、供应链和营销目录。真实业务继续按任务边界拆分，并由对应领域的数据负责人评审；不要把所有术语和 Tool 合并成一个模型每次都要加载的巨大目录。

目录的 `databaseSchema` 必须与数据所有权一致；当前示例固定为独立 `ecommerce_fixture`，认证 SQL 不依赖 PostgreSQL `search_path`。

[智能问数落地](../INTELLIGENT_QUERY.md) 定义执行层的选择标准：认证业务查询目录是默认路径；semantic query compiler、独立语义层和 AlloyDB AI NL 都是需要额外准入条件与架构决策的升级路径。不要因业务问题变多而直接开放自由 SQL。

## 目录应包含

- 业务实体及其关系；只说明问数所需的粒度和关系。
- 指标：业务定义、计量字段、纳入/排除规则、时间字段和返回字段。
- 维度：业务名称、实际字段、允许取值、同义词和是否属于示例数据。
- 歧义规则：例如“营收”“订单数”不能直接猜测口径，必须追问。
- 问题模式：将常见问题路由到经过认证的 Toolbox Tool，而不是让模型生成任意 SQL。
- 查询契约：为每个认证 Tool 声明可返回的指标、维度、字段和限制；生成器补入 Tool 参数，运行时解析器据此生成唯一可执行计划并投影可追溯结果。
- 治理：数据所有者、敏感字段、可信身份过滤、数据新鲜度和答案溯源要求。

新增业务目录前，先确认该能力属于认证业务问数 Tool、未来 compiler 或外部语义层；不同类别的完整准入矩阵见 [智能问数落地](../INTELLIGENT_QUERY.md#tool-分类与准入矩阵)。

`tools.yaml` 仍是 SQL Tool 的唯一事实源，Capability Pack 是 Toolset/scope/Skill/catalog 关系的唯一事实源，语义目录是查询溯源的可执行事实源。`pnpm toolbox:check:semantic` 会用与运行时相同的 Zod schema 双向校验 Pack、Tool 和查询契约，并执行固定 `asOf`、固定 UTC、固定 candidate 的 resolver golden evaluation；该门禁不替代模型候选提取或真实 Toolbox E2E。`pnpm skills:generate:toolbox` 同步生成类型化 runtime 目录，以及 Claude 与 Eve Skill 的语义参考。

生产目录不得把 `tenantId`、组织范围、角色或 PII 作为模型可控过滤条件。它们必须由认证后的可信身份在执行前注入，并在数据库侧以 RLS 或等效机制强制执行。

每个 Tool 必须有正常路由 case；各领域还应覆盖歧义、空结果、异常数据、UTC 边界、非法时间窗和 capability isolation，电商目录继续覆盖部分退款。`pnpm toolbox:verify:local` 会对代表性可执行场景连接本机 PostgreSQL 与临时官方 Toolbox 做真实回归。
