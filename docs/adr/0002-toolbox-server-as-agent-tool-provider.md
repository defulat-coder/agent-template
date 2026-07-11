# ADR 0002: Use MCP Toolbox as an Agent Tool Provider

## Status

Accepted, superseded in part by [ADR 0003: Host-Managed MCP](./0003-host-managed-mcp.md)

## Context

The template has two independent Agent runtimes: Cloud and Eve. Both should be able to use database-backed tools without either runtime owning database connection details.

MCP Toolbox for Databases has two relevant modes:

- Build-time prebuilt generic tools for IDE and CLI exploration.
- Run-time custom tools defined by `tools.yaml` for production agents.

The template should stay reusable and avoid granting production Agents broad database access by default.

## Decision

Add `apps/toolbox` as the Toolbox server configuration boundary.

The Toolbox server is a separate Tool provider. It connects to PostgreSQL through environment variables and exposes named Toolbox toolsets. Per [ADR 0007](./0007-agent-runtime-owned-mcp-clients.md), `packages/agent-claude` and `packages/agent-eve` each connect through their framework-native MCP Client; neither imports `apps/toolbox/tools.yaml` nor owns database credentials.

The default `tools.yaml` exposes only read-only `TemplateEvent` tools under `agent_template_read_model`. Prebuilt generic tools such as arbitrary SQL execution are allowed for local build-time exploration, but they are not the production Agent default.

## Consequences

- Cloud and Eve runtimes stay independent.
- Database tool permissions are visible in one audited `tools.yaml` file.
- New database tools require an explicit tool and toolset entry plus a matching shared Tool/Profile entry. Runtime profiles reduce model-visible tools; Toolbox OIDC, Tool scopes, restricted database roles and RLS/equivalent controls enforce authorization.
- Runtime-owned MCP is the production integration path: Claude uses the SDK HTTP MCP server configuration and Eve uses `defineMcpClientConnection`.
- Runtime-owned Toolbox connections such as project `.mcp.json` or `packages/agent-eve/agent/connections/toolbox.ts` are historical context, not the current implementation direction.

## References

- MCP Toolbox for Databases: `https://github.com/googleapis/mcp-toolbox`
- Official documentation: `https://mcp-toolbox.dev/`
- PostgreSQL source: `https://mcp-toolbox.dev/integrations/postgres/source/`
- Toolsets: `https://mcp-toolbox.dev/documentation/configuration/toolsets/`
