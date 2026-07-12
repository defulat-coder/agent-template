# packages/agent-claude 协作指南

## 职责

`packages/agent-claude` 是 filesystem-first Claude Agent SDK runtime；`.claude/` 是 authored surface，`src/` 只负责配置、SDK adapter 和事件投影。

## 能力边界

- `parseClaudeAgentConfig` 只读取 Claude runtime 相关环境变量。
- `getClaudeAgentRuntimeStateFromEnv` 返回 API key 配置状态和模型。
- `checkClaudeAgentReadiness` 不调用模型；配置 Toolbox 时用临时 MCP Client 校验 capability profile 的 Tool 可发现性并及时关闭。
- `loadClaudeAgentSdk` 保持懒加载，避免无 key 时影响本地启动。
- 项目常驻指令放 `.claude/CLAUDE.md`；业务 Skill 放 `.claude/skills/`，不放仓库根目录。
- SDK `cwd` 默认固定为本 package 根目录，并启用 `settingSources: ["project"]`；部署复制 authored surface 时才使用 `CLAUDE_PROJECT_DIR` 覆盖，目标必须通过 package、`CLAUDE.md`、Skill manifest 和已启用 Skill 校验。
- `skills` 必须直接使用 capability activation 的 `enabledSkills`，并由 `.claude/skills-manifest.json` 校验 authored surface；不要再从 Tool 子集反推 Skill、手写 profile 映射或使用 `"all"`，避免加载祖先目录的项目协作 Skill。
- Kimi Code 通过 Anthropic-compatible env 接入：`ANTHROPIC_BASE_URL=https://api.kimi.com/coding/`、`ANTHROPIC_MODEL=kimi-for-coding`、`ANTHROPIC_API_KEY`。
- 传给 Claude Agent SDK subprocess 的 `env` 必须合并 `process.env`，不要替换掉 `PATH`、`HOME` 等运行时变量。
- Toolbox 通过 Claude Agent SDK 的 HTTP MCP server 配置直连；读取 `@agent-template/toolbox-config`，不要 import `apps/toolbox/tools.yaml`，不要把 `TOOLBOX_AUTH_TOKEN` 下发给 Claude Code subprocess env。
- Claude 实际可见的远端 MCP 工具必须来自 activation 的 `modelSurface.visibleTools`，`modelSurface.hiddenTools` 必须映射到 SDK `disallowedTools`；启用业务 Pack 时额外暴露进程内 `query_business_data`，底层业务 Tool 仅在 `semanticExecutionTools` 内由该 Tool 的 runtime-owned MCP Client 执行。
- `query_business_data` 只把用户原问题与 canonical candidate 交给 `@agent-template/semantic-query`；不得接受 Tool 名、SQL、表列名或身份范围。其 MCP Client 必须在成功和失败路径都关闭。
- SDK `tool_use.id` 与后续 `tool_result.tool_use_id` 必须在 adapter 内关联，再输出 shared `callId/toolName` event。
- 业务 Capability Pack Skill 由根目录的 Toolbox 官方生成器同步，不手工维护 runtime 副本，也不安装官方生成的数据库直连脚本。

## 不应该做

- 不处理 HTTP 请求或 BullMQ job 生命周期。
- 不实现 runtime selector；selector 留在 `@agent-template/agent`。
- 不写具体业务 prompt。
- 不把 Claude runtime authored surface 写入仓库根 `.claude/`；根目录只服务整个项目的协作 Agent。
- 不把 Kimi API Key 写入仓库。
- 不把 PostgreSQL 连接信息放进 Claude runtime 配置；数据库权限留在 Toolbox server。
- 不恢复共享 MCP Host 或 API MCP 代理；Toolbox 连接、Bearer header 与 Tool policy 由本 runtime 配置。
- 不凭记忆直接写 Claude Agent SDK API；以官方文档和已安装包类型为准。

## 官方参考

- Claude Code Docs: `https://code.claude.com/docs`
- Claude Agent SDK overview: `https://code.claude.com/docs/en/agent-sdk/overview`
- Claude Agent SDK TypeScript options: `https://code.claude.com/docs/en/agent-sdk/typescript`
- Claude Code settings: `https://code.claude.com/docs/en/settings`
- Claude Code memory and CLAUDE.md: `https://code.claude.com/docs/en/memory`
- Claude Code `.claude/` directory: `https://code.claude.com/docs/en/claude-directory`
- Claude Code filesystem features in Agent SDK: `https://code.claude.com/docs/en/agent-sdk/claude-code-features`
- Claude Agent SDK Skills: `https://code.claude.com/docs/en/agent-sdk/skills`
- Claude Code MCP: `https://code.claude.com/docs/en/mcp`
- MCP protocol introduction: `https://modelcontextprotocol.io/docs/getting-started/intro`
- Claude Code permissions: `https://code.claude.com/docs/en/permissions`
- Kimi Code docs: `https://www.kimi.com/code/docs/`

## 验证

```bash
pnpm --filter @agent-template/agent-claude lint
pnpm --filter @agent-template/agent-claude test
pnpm --filter @agent-template/agent-claude typecheck
pnpm --filter @agent-template/agent-claude build
```
