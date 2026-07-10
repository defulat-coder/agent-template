# 业务语义目录

这里保存面向智能问数的可版本化业务语义目录。目录不是数据库 schema 的副本，而是将业务语言映射到经过认证的指标、维度、枚举取值和受控 Toolbox Tool 的契约。

当前的 [ecommerce.yaml](./ecommerce.yaml) 是合成电商 fixture 的完整示例。真实业务应按领域分别建立目录，例如 `sales.yaml`、`supply-chain.yaml` 或 `customer-success.yaml`，并由该领域的数据负责人评审。

[智能问数落地](../INTELLIGENT_QUERY.md) 定义执行层的选择标准：认证业务查询目录是默认路径；semantic query compiler、独立语义层和 AlloyDB AI NL 都是需要额外准入条件与架构决策的升级路径。不要因业务问题变多而直接开放自由 SQL。

## 目录应包含

- 业务实体及其关系；只说明问数所需的粒度和关系。
- 指标：业务定义、计量字段、纳入/排除规则、时间字段和返回字段。
- 维度：业务名称、实际字段、允许取值、同义词和是否属于示例数据。
- 歧义规则：例如“营收”“订单数”不能直接猜测口径，必须追问。
- 问题模式：将常见问题路由到经过认证的 Toolbox Tool，而不是让模型生成任意 SQL。
- 查询契约：为每个认证 Tool 声明可返回的指标、维度、字段和限制；MCP Host 使用它生成可追溯的 Certified query result。
- 治理：数据所有者、敏感字段、可信身份过滤、数据新鲜度和答案溯源要求。

新增业务目录前，先确认该能力属于认证业务问数 Tool、未来 compiler 或外部语义层；不同类别的完整准入矩阵见 [智能问数落地](../INTELLIGENT_QUERY.md#tool-分类与准入矩阵)。

`tools.yaml` 仍是 SQL Tool 的唯一事实源，语义目录是 Host 查询溯源的可执行事实源。`pnpm toolbox:check:semantic` 会用与运行时相同的 Zod schema 校验目录、Tool 和查询契约，并同步生成 Claude 与 Eve Skill 的语义参考。

生产目录不得把 `tenantId`、组织范围、角色或 PII 作为模型可控过滤条件。它们必须由认证后的可信身份在执行前注入，并在数据库侧以 RLS 或等效机制强制执行。
