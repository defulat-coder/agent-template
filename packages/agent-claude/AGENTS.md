# packages/agent-claude 协作指南

## 职责

`packages/agent-claude` 是 Claude Agent SDK backed runtime，负责 Claude 配置解析和 SDK 懒加载。

## 能力边界

- `parseClaudeAgentConfig` 只读取 Claude runtime 相关环境变量。
- `getClaudeAgentRuntimeStateFromEnv` 返回 API key 配置状态和模型。
- `loadClaudeAgentSdk` 保持懒加载，避免无 key 时影响本地启动。
- Kimi Code 通过 Anthropic-compatible env 接入：`ANTHROPIC_BASE_URL=https://api.kimi.com/coding/`、`ANTHROPIC_MODEL=kimi-for-coding`、`ANTHROPIC_API_KEY`。
- 传给 Claude Agent SDK subprocess 的 `env` 必须合并 `process.env`，不要替换掉 `PATH`、`HOME` 等运行时变量。
- Toolbox server 通过 `@agent-template/mcp-host` 接入；Claude runtime 只创建 SDK MCP server 表面并委托 Host，不直接 import `apps/toolbox/tools.yaml`，不把 `TOOLBOX_URL` / `TOOLBOX_TOOLSET` 下发给 Claude Code subprocess。
- 项目级业务 Skill 放在根目录 `.claude/skills/`；Claude Agent SDK 必须启用 project setting source 和 skills，Skill 仍只调用 Host-managed MCP tools。
- 电商业务 Skill 由根目录的 Toolbox 官方生成器同步，不手工维护两份副本，也不安装官方生成的数据库直连脚本。

## 不应该做

- 不处理 HTTP 请求或 BullMQ job 生命周期。
- 不实现 runtime selector；selector 留在 `@agent-template/agent`。
- 不写具体业务 prompt。
- 不把 Kimi API Key 写入仓库。
- 不把 PostgreSQL 连接信息放进 Claude runtime 配置；数据库权限留在 Toolbox server。
- 不恢复项目级 `.mcp.json` / `.claude/settings.json` 作为 Toolbox 主路径；生产形态以 Host-managed MCP 为准。
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
