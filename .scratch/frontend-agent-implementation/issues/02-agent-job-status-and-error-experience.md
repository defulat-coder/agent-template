Status: ready-for-agent

## Parent

`.scratch/frontend-agent-implementation/PRD.md`

## What to build

Improve the Web Agent console after Agent job submission so users can clearly understand accepted, failed, and retry-ready states. Backend non-OK responses and network failures should be displayed as distinct user-facing outcomes.

This slice should make the first Agent console production-usable for queued Agent jobs, even before streaming run events exist.

## Acceptance criteria

- [ ] Accepted Agent jobs are shown with a clear status distinct from idle and submitting states.
- [ ] Backend non-OK responses are shown as backend submission failures.
- [ ] Network failures are shown separately from backend submission failures.
- [ ] A failed submission leaves the prompt available so the user can retry.
- [ ] Long prompts, long job metadata, and long error messages remain readable without breaking the layout.
- [ ] The console remains usable on mobile and desktop viewports.
- [ ] The UI remains consistent with the existing Web app design language.
- [ ] Tests cover non-OK backend responses, network failures, retry-ready state, and preservation of submitted prompt text.

## Blocked by

- `.scratch/frontend-agent-implementation/issues/01-web-agent-console-submit-agent-job.md`
