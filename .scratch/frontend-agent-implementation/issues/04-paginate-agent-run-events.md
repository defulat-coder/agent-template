Status: ready-for-human

## Parent

`.scratch/frontend-agent-implementation/PRD.md`

## Problem

`AgentRunRepository.list()` currently includes the complete persisted event
history for every returned run. The run list itself is paginated, but a single
long-running Agent execution can still make response size and server memory
grow without an event-level bound.

This is a capacity risk rather than a retained-memory leak, and changing it
requires an explicit API decision because current consumers receive events
inside each run record.

## What to build

Separate run summaries from event history and add cursor pagination for events
within one run. Web consumers should load recent events first and request older
history only when the user asks for it.

## Acceptance criteria

- [ ] Agent run list responses do not include an unbounded event collection.
- [ ] A run's events can be fetched with a stable cursor and explicit limit.
- [ ] Event ordering remains deterministic across pages.
- [ ] The Web workspace loads recent events first and supports older-history loading.
- [ ] API compatibility and migration behavior are documented before implementation.
- [ ] Tests cover a run with enough events to require multiple pages.

## Comments

- Identified during the memory and local-load architecture review on 2026-07-11.
- Not part of the QA crash path fixed by ADR 0016.
