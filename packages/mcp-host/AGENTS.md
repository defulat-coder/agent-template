# packages/mcp-host 协作指南

## 职责

`packages/mcp-host` 是 MCP Host 的核心协议边界，负责 MCP server registry、MCP client lifecycle、tools/list、tools/call、resources/read 和 MCP Apps 输出归一化。

## 能力边界

- MCP Host 是平台能力，不属于 Claude 或 Eve runtime。
- 每个 MCP Server 对应一个 MCP Client connection。
- server registry 默认读取根目录 `mcp-host.config.json` 的 `servers`；文件不存在时才回退环境变量，旧的 `toolboxUrl` / `toolboxToolset` 仅作为兼容入口。
- `mcp-host.config.json` 支持 `${NAME}` 和 `${NAME:-fallback}` 字符串占位，用于同一文件兼容本机和 Docker。
- 浏览器不直接连接 MCP Server；`apps/web` 通过 `apps/api` 使用这里的能力。
- Tool call、resource read 和 UI artifact 需要返回结构化结果，供 API SSE 和 Web timeline 渲染。

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
```
