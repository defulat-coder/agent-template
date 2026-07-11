# Deployment-selected runtime loading

## Status

Accepted.

## Decision

`@agent-template/agent` owns the runtime selector but does not statically load concrete runtime modules. Synchronous environment parsing and runtime state remain in the public package; execution and readiness dynamically import only the adapter selected by `AGENT_RUNTIME`.

API and Worker depend only on `@agent-template/agent`. Concrete runtime dependencies remain in the Agent package graph and build into separate dynamic chunks.

## Consequences

- Starting an API or Worker process does not initialize the unselected runtime or its framework.
- Runtime-specific parsing, execution, MCP Client, and health behavior stay in their adapter package.
- Tests replace adapter loaders and can prove the unselected loader is never called.
- Bundle verification asserts that API/Worker entries contain neither runtime implementation and reference distinct Claude/Eve chunks.
