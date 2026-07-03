Status: ready-for-agent

## Parent

`.scratch/frontend-agent-implementation/PRD.md`

## What to build

Build the first usable Web Agent console. A user can open the Agent page, enter a prompt, submit it to the existing Agent job intake API, and see the accepted Agent job metadata returned by the backend.

This slice should prove the browser-to-backend path works end to end without adding or changing Agent runtime behavior.

## Acceptance criteria

- [ ] A user can open a dedicated Agent page in the Web app.
- [ ] A user can enter a prompt and submit it from the browser.
- [ ] Empty or whitespace-only prompts are rejected before a backend request is sent.
- [ ] While submission is in progress, the UI prevents accidental duplicate submission.
- [ ] A successful backend response shows the Agent job id when present and the queue name.
- [ ] The frontend uses the configured public API base URL.
- [ ] The Web app does not expose or require backend Agent runtime credentials.
- [ ] Tests cover prompt validation, successful submission, and accepted metadata rendering at the highest practical Web seam.

## Blocked by

None - can start immediately
