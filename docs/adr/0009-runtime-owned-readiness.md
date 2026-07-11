# Runtime-owned readiness

## Status

Accepted.

## Decision

`GET /health` reports configuration and readiness separately for the deployment-selected Agent runtime. The public selector in `packages/agent` chooses exactly one runtime readiness adapter and bounds it with a short timeout.

Claude readiness validates credentials and, when enabled, opens a transient MCP connection to Toolbox and checks that every Tool in the selected capability profile is discoverable. Eve readiness calls the installed framework's official `Client.health()` endpoint. API does not implement either protocol.

## Consequences

- A configured runtime may still be not ready; readiness failure degrades API health.
- Tests with external checks disabled return `skipped` without requiring credentials or services.
- Readiness never sends a model prompt and therefore does not create a billable Agent run.
- Temporary Toolbox verification starts the official platform binary directly so process cleanup includes the real server process.
