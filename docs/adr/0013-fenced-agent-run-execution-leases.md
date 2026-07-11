# Fenced Agent run execution leases

## Status

Accepted.

## Decision

Every `queued -> running` transition claims a renewable Agent run execution lease in PostgreSQL. The claim increments `executionAttempt`, assigns an opaque fencing token, and records `heartbeatAt` plus `leaseExpiresAt`. A BullMQ retry may reclaim a `running` record only after that lease expires.

Execution events and terminal state updates are conditional on the current fencing token. Heartbeat renewal also verifies cancellation and token ownership. A replaced executor aborts and cannot overwrite the new attempt, even if its runtime returns late.

PostgreSQL `clock_timestamp()` is the only authority for lease claim, expiry, renewal, event acceptance, and terminal acceptance. Process timestamps remain business metadata and cannot extend, expire, or revive a lease.

The lifecycle interface owns lease duration and monitoring. The Prisma adapter owns atomic claim, heartbeat, fenced event insert, and fenced finish operations. BullMQ locks and attempt counters remain delivery mechanics, not Agent run state.

The BullMQ delivery adapter derives its fixed retry delay from the lifecycle's default lease duration and adds a grace period. A failed or stalled delivery therefore cannot exhaust rapid retries while the previous database lease is still active.

## Consequences

- A Worker process crash no longer leaves an Agent run permanently stuck in `running`; normal BullMQ redelivery can reclaim it after expiry.
- If cancellation was requested after a crash, the first post-expiry redelivery finalizes `cancelled` instead of reclaiming execution.
- Partial events from an expired attempt remain ordered evidence. A reclaimed attempt appends from the next sequence.
- `executionAttempt`, `heartbeatAt`, and `leaseExpiresAt` are visible in Agent run snapshots and Toolbox observability; the fencing token is never exposed.
- Lease duration must exceed the heartbeat interval. Temporary database failures fail closed by aborting the current executor rather than allowing unfenced writes.
- Worker clock skew cannot cause early reclaim or late write acceptance.
- Local verification covers pre-expiry rejection, post-expiry reclaim, stale event rejection, stale terminal rejection, and successful completion by the new executor.
- A native Redis/BullMQ verifier proves the second delivery occurs only after the configured lease plus grace period.
