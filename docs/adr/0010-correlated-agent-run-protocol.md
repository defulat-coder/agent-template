# Correlated Agent run protocol

## Status

Accepted.

## Decision

Shared Tool events identify both the invocation and the capability: `tool-call` and `tool-result` carry the same `callId` and `toolName`; call input remains JSON. Runtime adapters correlate their private protocol before emitting shared events. Cancellation has its own `cancelled` event and is not represented as a runtime error.

`AgentRunResult` is a status-discriminated union. Completed results require `events` and `output`; failed and cancelled results require `events` and `reason`; skipped results require `reason`.

## Consequences

- Web and persistence consumers no longer guess whether `tool` means a name or a call id.
- Claude keeps an invocation map while consuming SDK messages; Eve projects its native `callId` and `toolName`.
- Uncorrelated runtime data becomes an `unknown` event instead of fabricating tool identity.
- A database migration converts existing v1 Tool event payloads into the v2 shape with explicit legacy identifiers.
