# Bound Agent stream memory and local build load

## Status

Accepted.

## Context

Agent runtimes emit cumulative text snapshots while streaming. Retaining every
snapshot makes terminal event memory grow quadratically with output length, and
an unbounded SSE frame can retain arbitrary data before a delimiter arrives.

Next.js 16 also enables Turbopack by default. In Codex Desktop on macOS, the
project observed a native `next-swc` worker crash during `fork()` accompanied by
a severe system load spike. Webpack completed the same development and build
paths without that native worker failure.

## Decision

- Runtime terminal results and lifecycle fallback results keep only the latest
  event from a consecutive series of cumulative text snapshots. Live consumers
  may still receive intermediate snapshots.
- The lifecycle event writer serializes persistence, coalesces queued cumulative
  text snapshots under backpressure, consumes its queue in O(1), and fails the
  run when more than 1,000 non-compacted events are waiting to persist.
- Browser event history is bounded to 500 events while preserving the latest
  Artifact event when it falls outside the recent window.
- Agent SSE parsers reject an unterminated frame after 16 MiB and always release
  their reader. Cancelling or unmounting the Web workspace aborts upstream work.
- Web development, Web builds, and Web QA use Next.js webpack mode. Next.js build
  workers are limited to two until the observed Turbopack/macOS failure is known
  to be resolved.
- Web QA children run in process groups and are terminated as a group so pnpm
  wrappers cannot leave Next.js or fixture descendants behind.
- The Web QA stream driver cancels delays after disconnects, honors writable
  backpressure, and rejects request bodies larger than 1 MiB.

## Consequences

- Streaming remains responsive, while retained memory grows linearly with the
  final output instead of quadratically with every partial snapshot.
- A single Artifact or SSE message larger than 16 MiB must move to external
  storage or a chunked protocol rather than the inline Agent event stream.
- Very old browser timeline entries may be omitted from the live view; durable
  run events remain available from the platform record.
- Local compilation may be slower than unrestricted Turbopack, but it has a
  bounded worker count and a verified clean shutdown path.
