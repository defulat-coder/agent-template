# Stream Structured Agent UI with json-render

## Status

Accepted

## Context

Agent Chat must keep normal text answers, but some MCP and tool results are easier to inspect as tables or reports. A fixed report page would not fit the Chat workflow, and hard-coding one UI per tool would couple the Web app to each backend capability.

json-render provides a guarded component catalog and a SpecStream JSON Patch format, so the Agent path can stream structured UI updates while the browser renders only approved components.

## Decision

Add a Structured Agent UI branch to the shared Agent run event protocol. The event carries `json-render` patches over the existing `/agent/chat` SSE stream. `packages/mcp-host` owns conversion from structured tool results into UI patches, and `apps/web` owns the json-render component catalog and React renderer.

Normal Chat text remains on existing `text` and `done` events. Structured UI is additive; it does not replace the final answer.

## Consequences

- Frontend can render report and table data progressively in Chat.
- Web stays guarded because it only registers a small component catalog.
- API remains transport-only for SSE and does not build UI specs.
- New report shapes should first reuse the existing catalog; add components only when existing `Report`, `MetricGrid`, `Metric`, and `DataTable` cannot express the data.

## References

- json-render: `https://github.com/vercel-labs/json-render`
