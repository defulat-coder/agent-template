# 项目文档生成说明

为本仓库生成面向工程师和未来 Agent 的中文项目文档，技术名词保留英文。

优先覆盖：

- 从 `openwiki/quickstart.md` 开始的清晰导航；
- `apps/` 与 `packages/` 的职责、依赖方向和运行进程；
- Agent job、Agent run、Agent conversation 与 runtime adapter 的生命周期；
- Claude/Eve runtime、Toolbox、PostgreSQL、Redis 和 BullMQ 的集成关系；
- 本地开发、数据库、测试、构建和故障排查流程；
- `CONTEXT.md` 领域语言与 `docs/adr/` 已接受决策；
- 修改主要模块时需要运行的验证命令和容易破坏的约束。

把源码、`CONTEXT.md`、适用范围内的 `AGENTS.md` 和 `docs/adr/` 视为事实来源。生成文档是可再生投影；发生冲突时不得让 Wiki 覆盖事实来源。不要读取或记录 `.env`、密钥、token、真实凭据和私有数据。
