# Platform-owned Agent conversations

## Status

Accepted.

## Decision

The platform owns `Agent conversation` identity and history independently of
Claude or Eve runtime session identifiers. One Agent conversation contains an
ordered series of Agent runs; every new user turn creates exactly one durable
Agent run record before execution.

That Agent run record persists the canonical input required to retry the turn,
including structured Human-input responses. Execution resume reconstructs its
input from the record rather than relying on request-local memory, so API and
Worker execution observe the same input after redelivery or process restart.

The selected Agent runtime adapter accepts and returns opaque Agent runtime
continuation state through the `@agent-template/agent` seam. The API and CLI
never expose that state. PostgreSQL stores it on the Agent conversation for the
next turn, and only the matching runtime adapter may parse it.

An Agent conversation is pinned to the deployment-selected runtime when it is
created. If a later deployment selects a different runtime, existing
conversations remain readable but cannot accept another turn until an explicit
migration or replay mechanism exists.

Claude continuation uses a resumable Claude session and therefore requires
session persistence available to the executing deployment. Eve continuation
stores its full client session cursor, including the continuation token,
runtime session ID, and stream index. A runtime session ID alone is never
sufficient as the platform conversation contract.

At most one non-terminal Agent run may belong to an Agent conversation at a
time. A concurrent send returns a conflict rather than guessing an order.

## Consequences

- The public identifier is `conversationId`; runtime session identifiers and
  continuation tokens remain server-private.
- The internal runtime and persisted `AgentRun.sessionId` field is renamed to
  `runtimeSessionId`; public schemas omit it.
- Agent conversation listing and history work the same for Claude and Eve even
  though their continuation implementations differ.
- Switching `AGENT_RUNTIME` does not silently reinterpret or discard an
  existing conversation's runtime state.
- Runtime continuation state must be treated as sensitive data and must not be
  logged, returned by the API, or rendered by the CLI.
- Conversation deletion and retention require a separate decision because
  runtime-owned transcripts and continuation data may need coordinated cleanup.
