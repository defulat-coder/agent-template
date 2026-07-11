# Agent-runtime-owned MCP clients

## Status

Accepted; supersedes [ADR 0003](./0003-host-managed-mcp.md) and [ADR 0005](./0005-render-mcp-apps-in-chat.md).

Claude and Eve each own their Toolbox MCP Client through their framework-native connection interface: Claude Agent SDK receives a remote HTTP MCP server config, while Eve declares `agent/connections/toolbox.ts`. A shared Toolbox configuration module may validate URL, service token, and capability profile, but it cannot own Client lifecycle or proxy Tool calls. Consequently the API/Web MCP proxy and Host-specific MCP App path are removed; database authorization remains in Toolbox and PostgreSQL, and each runtime independently restricts model-visible tools from the same capability profile.
