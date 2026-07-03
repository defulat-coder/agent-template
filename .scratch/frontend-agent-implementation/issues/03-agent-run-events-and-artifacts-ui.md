Status: ready-for-agent

## Parent

`.scratch/frontend-agent-implementation/PRD.md`

## What to build

Add the frontend rendering layer for Agent run events and artifacts, using `agentcn` only as a UX reference. The console should be able to display normalized run events such as tool calls, tool results, text deltas, completion, errors, unknown events, and tabbed artifacts.

This slice should prepare the Web Agent console for future streaming or polling APIs without requiring backend streaming work now.

## Acceptance criteria

- [ ] Tool call events render distinctly from normal Agent text.
- [ ] Tool result events render distinctly from tool calls.
- [ ] Text delta or text output events render as readable Agent output.
- [ ] Completion events render final output separately from intermediate events.
- [ ] Error events render as user-visible failures without breaking the whole console.
- [ ] Unknown event shapes render defensively as generic or raw log entries.
- [ ] Artifacts can be displayed in tabs with readable markdown, JSON, or code-like content.
- [ ] Artifact content can be copied from the UI.
- [ ] The implementation documents or encodes that `agentcn` is a frontend UX reference only, not a source for Eve or Flue runtime recipes.
- [ ] Tests cover event normalization and rendering for known, unknown, error, and artifact event cases.

## Blocked by

- `.scratch/frontend-agent-implementation/issues/01-web-agent-console-submit-agent-job.md`
