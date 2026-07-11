# Render MCP Apps in Chat

## Status

Superseded by [ADR 0007: Agent-runtime-owned MCP clients](./0007-agent-runtime-owned-mcp-clients.md). The Host-specific MCP App path is removed with the shared MCP Host.

The remaining sections record the superseded design and are not normative for the current Web implementation.

## Historical context

Agent Template needs interactive Agent UI inside Chat, including tables and dashboards that can refresh data through MCP tools.

MCP Apps fit that path directly: an MCP tool can point to an interactive `ui://` HTML resource, the Host renders that resource in a sandboxed iframe, and the app talks back to the Host through a JSON-RPC-style `postMessage` bridge. This keeps the interactive UI inside Chat and lets the app call MCP tools through the Host instead of inventing a separate frontend API.

## Historical decision

The superseded design selected MCP Apps as the only interactive Agent UI path and removed the previous structured UI renderer.

The MCP Host owns MCP App resources and emits `mcp-app` UI events with:

- `ui://` resource URI
- `text/html;profile=mcp-app` resource MIME type
- server id and tool name used by the Host bridge
- initial tool data for iframe initialization

The Web app renders MCP Apps in a sandboxed iframe inside the assistant message body. The iframe sends `tools/call` JSON-RPC messages with `postMessage`; Web validates the iframe source and proxies the call to `apps/api`, which delegates to `@agent-template/mcp-host`.

## Historical consequences

- Agent UI has one protocol: MCP Apps.
- Interactive MCP UI stays in Chat, not in a standalone page.
- The iframe cannot access the parent page directly because it runs with `sandbox="allow-scripts"`.
- Production examples must verify both initial render and iframe-initiated `tools/call`.
- Future MCP Apps should reuse the Host bridge before adding app-specific Web APIs.

## References

- MCP Apps overview: `https://modelcontextprotocol.io/extensions/apps/overview`
- MCP Apps announcement: `https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/`
