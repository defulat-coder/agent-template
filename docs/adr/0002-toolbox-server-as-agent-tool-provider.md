# ADR 0002: Use MCP Toolbox as an Agent Tool Provider

## Status

Accepted

## Context

The template has two independent Agent runtimes: Cloud and Eve. Both should be able to use database-backed tools without either runtime owning database connection details.

MCP Toolbox for Databases has two relevant modes:

- Build-time prebuilt generic tools for IDE and CLI exploration.
- Run-time custom tools defined by `tools.yaml` for production agents.

The template should stay reusable and avoid granting production Agents broad database access by default.

## Decision

Add `apps/toolbox` as the Toolbox server configuration boundary.

The Toolbox server is a separate Tool provider. It connects to PostgreSQL through environment variables and exposes named Toolbox toolsets. Agent runtimes may load those toolsets through MCP or a runtime-specific MCP bridge, but `packages/agent-claude` and `packages/agent-eve` do not import Toolbox config or own database credentials.

The default `tools.yaml` exposes only read-only `TemplateEvent` tools under `agent_template_read_model`. Prebuilt generic tools such as arbitrary SQL execution are allowed for local build-time exploration, but they are not the production Agent default.

## Consequences

- Cloud and Eve runtimes stay independent.
- Database tool permissions are visible in one audited `tools.yaml` file.
- New database tools require an explicit tool and toolset entry.
- Cloud runtime loads the default Toolbox toolset through Claude Code project files: `.mcp.json` for the server and `.claude/settings.json` for tool permissions.
- Eve runtime loads the default Toolbox read tools through its own authored MCP connection at `packages/agent-eve/agent/connections/toolbox.ts`, not by importing `apps/toolbox/tools.yaml`.

## References

- MCP Toolbox for Databases: `https://github.com/googleapis/mcp-toolbox`
- Official documentation: `https://mcp-toolbox.dev/`
- PostgreSQL source: `https://mcp-toolbox.dev/integrations/postgres/source/`
- Toolsets: `https://mcp-toolbox.dev/documentation/configuration/toolsets/`
