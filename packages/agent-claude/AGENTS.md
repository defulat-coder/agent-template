# packages/agent-claude 协作指南

## 职责

`packages/agent-claude` 是 Claude Agent SDK backed runtime，负责 Claude 配置解析和 SDK 懒加载。

## 能力边界

- `parseClaudeAgentConfig` 只读取 Claude runtime 相关环境变量。
- `getClaudeAgentRuntimeStateFromEnv` 返回 API key 配置状态和模型。
- `checkClaudeAgentReadiness` 不调用模型；配置 Toolbox 时用临时 MCP Client 校验 capability profile 的 Tool 可发现性并及时关闭。
- `loadClaudeAgentSdk` 保持懒加载，避免无 key 时影响本地启动。
- Kimi Code 通过 Anthropic-compatible env 接入：`ANTHROPIC_BASE_URL=https://api.kimi.com/coding/`、`ANTHROPIC_MODEL=kimi-for-coding`、`ANTHROPIC_API_KEY`。
- 传给 Claude Agent SDK subprocess 的 `env` 必须合并 `process.env`，不要替换掉 `PATH`、`HOME` 等运行时变量。
- Toolbox 通过 Claude Agent SDK 的 HTTP MCP server 配置直连；读取 `@agent-template/toolbox-config`，不要 import `apps/toolbox/tools.yaml`，不要把 `TOOLBOX_AUTH_TOKEN` 下发给 Claude Code subprocess env。
- Claude 实际可见的 MCP 工具必须由 `AGENT_CAPABILITY_PROFILE` 生成 SDK `allowedTools`；不要在 runtime 内再维护一份硬编码全量名单，也不要把该 profile 冒充授权。
- SDK `tool_use.id` 与后续 `tool_result.tool_use_id` 必须在 adapter 内关联，再输出 shared `callId/toolName` event。
- 项目级业务 Skill 放在根目录 `.claude/skills/`；Claude Agent SDK 必须启用 project setting source 和 skills，Skill 调用 `mcp__toolbox__*`。
- 电商业务 Skill 由根目录的 Toolbox 官方生成器同步，不手工维护两份副本，也不安装官方生成的数据库直连脚本。

## 不应该做

- 不处理 HTTP 请求或 BullMQ job 生命周期。
- 不实现 runtime selector；selector 留在 `@agent-template/agent`。
- 不写具体业务 prompt。
- 不把 Kimi API Key 写入仓库。
- 不把 PostgreSQL 连接信息放进 Claude runtime 配置；数据库权限留在 Toolbox server。
- 不恢复共享 MCP Host 或 API MCP 代理；Toolbox 连接、Bearer header 与 Tool policy 由本 runtime 配置。
- 不凭记忆直接写 Claude Agent SDK API；以官方文档和已安装包类型为准。

## 官方参考

- Claude Code Docs: `https://code.claude.com/docs`
- Claude Agent SDK overview: `https://code.claude.com/docs/en/agent-sdk/overview`
- Claude Agent SDK TypeScript options: `https://code.claude.com/docs/en/agent-sdk/typescript`
- Claude Code settings: `https://code.claude.com/docs/en/settings`
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
