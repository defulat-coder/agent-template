# Host-Managed MCP

## Status

Superseded by [ADR 0007: Agent-runtime-owned MCP clients](./0007-agent-runtime-owned-mcp-clients.md).

## Historical decision

This section records the superseded design and is not normative for current implementation. Agent Template would have treated MCP Host as a platform capability owned by the application, not by a specific Agent runtime. MCP client lifecycle, server registry, primitive discovery, tool calls, resources, and MCP Apps handling would have lived behind a shared `packages/mcp-host` boundary and been exposed through `apps/api` to `apps/web`.

The proposal attempted to avoid divergence between runtime-owned connections. It was removed because the chosen architecture lets each framework-native runtime own its MCP Client and keeps API/Web out of the Tool protocol path.
