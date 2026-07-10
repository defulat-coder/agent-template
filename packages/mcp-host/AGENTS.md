# packages/mcp-host 协作指南

## 职责

`packages/mcp-host` 是 MCP Host 的核心协议边界，负责 MCP server registry、MCP client lifecycle、tools/list、tools/call、resources/read 和 MCP Apps 输出归一化。

## 能力边界

- MCP Host 是平台能力，不属于 Claude 或 Eve runtime。
- 每个 MCP Server 对应一个 MCP Client connection。
- server registry 默认读取根目录 `mcp-host.config.json` 的 `servers`；文件不存在时才回退环境变量，旧的 `toolboxUrl` / `toolboxToolset` 仅作为兼容入口。
- `servers.*.allowedTools` 是 Host 侧 fail-closed allowlist；新 Toolbox tool 必须同时加入对应 toolset 与 allowlist，不能只依赖 MCP 的 `tools/list` 发现结果。缺少 allowlist 时拒绝配置，只有显式 `allowAllToolsForDevelopment` 才能在开发期放开。
- 出站 Bearer token 只从可信 `McpHostInvocationContext` 或 server 的 `authTokenEnv` 解析；不写入 server 列表、Tool schema、模型参数或 Tool 结果。
- `capabilityProfiles` 是部署选择的模型可见工具子集，必须完全落在对应 server 的 `allowedTools` 内；它负责最小化能力呈现，不替代认证或授权。
- `semanticCatalogs` 指向运行时 Zod 校验的业务语义目录；认证 Tool 结果必须由 Host 附加 `structuredContent.certifiedQuery`，不得伪造数据刷新时间。
- `mcp-host.config.json` 支持 `${NAME}` 和 `${NAME:-fallback}` 字符串占位，用于同一文件兼容本机和 Docker。
- 浏览器不直接连接 MCP Server；`apps/web` 通过 `apps/api` 使用这里的能力。
- Tool call、resource read 和 MCP App 需要返回结构化结果，供 API SSE 和 Web Chat 渲染。
- Agent 交互式 UI 统一用 MCP App：这里负责 `ui://` resource、`text/html;profile=mcp-app` 内容和初始 tool data，不再生成 JSON Render patch stream。
- Toolbox 集成验证默认运行 `verify:ecommerce-toolbox:local`，由脚本启动临时官方二进制；只有用户明确要求时才运行 `verify:ecommerce-toolbox:docker`。

## 不应该做

- 不处理 Fastify route、SSE header 或浏览器 postMessage。
- 不写模型 prompt 或 runtime selector。
- 不持有 Agent runtime 选择逻辑。
- 不把数据库连接信息写进代码；数据库权限留给 MCP Server。

## 官方参考

- MCP architecture: `https://modelcontextprotocol.io/docs/learn/architecture`
- MCP clients: `https://modelcontextprotocol.io/docs/learn/client-concepts`
- MCP Apps overview: `https://modelcontextprotocol.io/extensions/apps/overview`

## 验证

```bash
pnpm --filter @agent-template/mcp-host lint
pnpm --filter @agent-template/mcp-host test
pnpm --filter @agent-template/mcp-host typecheck
pnpm --filter @agent-template/mcp-host build
pnpm --filter @agent-template/mcp-host verify:ecommerce-toolbox:local
```
