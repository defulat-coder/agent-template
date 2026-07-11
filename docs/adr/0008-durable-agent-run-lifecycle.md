# Durable Agent run lifecycle

## Status

Accepted.

## Decision

`packages/agent` owns one durable Agent run lifecycle for both Chat SSE and queued jobs. PostgreSQL is the source of truth for run status, ordered events, terminal result, and cancellation requests; BullMQ only delivers a `runId` and retries delivery.

The lifecycle creates a run before execution or enqueue, atomically transitions `queued -> running`, persists events in sequence order, and writes exactly one terminal state. API and Worker assemble the same lifecycle with the Prisma repository. Runtime adapters receive cooperative cancellation through `AbortController`.

## Consequences

- `POST /agent/chat` and `POST /agent/jobs` create durable run records.
- `GET /agent/runs/:runId` reads the source of truth; `DELETE /agent/runs/:runId` requests cancellation.
- A queued cancellation prevents execution; a running cancellation is observed by polling and forwarded to the selected runtime.
- BullMQ job identity equals `runId`, so retries resume the same record instead of creating duplicate runs.
- Queue state and SSE connection state are not authoritative Agent run state.
