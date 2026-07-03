# Frontend Agent Implementation PRD

Status: ready-for-agent

## Problem Statement

当前项目已经有后端 Agent 能力，包括 Agent job intake、Worker 和可通过环境变量选择的 Agent runtime。但 Web 应用还没有面向用户的前端 Agent 体验，用户无法在浏览器里输入 Agent 请求、提交到现有后端、观察执行状态、查看运行过程和结果产物。

用户希望参考 `shadcn-labs/agentcn` 的前端 Agent 交互形态，但只需要前端 Agent 的实现方案；后端 Agent 运行、Eve recipe、Claude Agent runtime 和 Worker 架构都已经在项目侧存在，不应在本需求里重新设计或导入。

## Solution

在 Web 应用中新增一个前端 Agent 控制台，作为现有后端 Agent 能力的浏览器端入口。控制台负责收集用户输入、调用既有后端接口提交 Agent job、展示接收结果、展示执行状态，并在后端提供事件能力后渲染运行日志、tool call、文本增量和 artifact。

`agentcn` 只作为前端体验参考：参考它的 Agent preview 交互、运行日志展示、artifact tabs 和 shadcn 风格组合。不采用它的 Eve/Flue recipe，不复制它的后端运行逻辑，不把前端 Agent 实现扩展成新的 Agent runtime。

## User Stories

1. As a user, I want to open a dedicated Agent page, so that I can run Agent work from the Web app.
2. As a user, I want to enter a prompt, so that I can describe the work I want the Agent to perform.
3. As a user, I want to submit my prompt from the browser, so that the existing backend can create an Agent job.
4. As a user, I want to see whether my Agent job was accepted, so that I know the request reached the backend.
5. As a user, I want to see the Agent job id when available, so that I can reference a specific run.
6. As a user, I want to see the queue or execution status, so that I understand whether the Agent is waiting, running, completed, or failed.
7. As a user, I want clear loading and disabled states while a submission is in progress, so that I do not accidentally submit duplicate requests.
8. As a user, I want validation feedback for empty input, so that I know what must be fixed before submitting.
9. As a user, I want backend errors to be shown in plain language, so that I can understand what went wrong.
10. As a user, I want network failures to be shown separately from backend validation failures, so that I can decide whether to retry.
11. As a user, I want the page to use the existing Web design style, so that it feels like part of the same product.
12. As a user, I want the Agent console to work on desktop screens, so that I can review longer outputs comfortably.
13. As a user, I want the Agent console to work on mobile screens, so that I can submit and inspect Agent runs from a smaller viewport.
14. As a user, I want long prompts and long outputs to stay readable, so that content does not break the layout.
15. As a user, I want submitted prompts to remain visible after submission, so that I can verify what was sent.
16. As a user, I want a concise run timeline, so that I can understand the Agent's progress without reading raw logs.
17. As a user, I want tool calls to be visually distinct from normal text, so that I can separate Agent reasoning output from external actions.
18. As a user, I want tool results to be visually distinct from tool calls, so that I can follow cause and effect in the run.
19. As a user, I want final results to be shown separately from intermediate events, so that I can quickly find the answer.
20. As a user, I want artifacts such as markdown, JSON, or code to appear in tabs, so that I can inspect each output without losing context.
21. As a user, I want to copy result content, so that I can reuse Agent output elsewhere.
22. As a user, I want the front end to call the configured API base URL, so that local and deployed environments work consistently.
23. As a developer, I want the Web Agent UI to depend only on public backend APIs, so that it does not couple directly to Agent runtime implementations.
24. As a developer, I want the front end to avoid exposing backend secrets, so that Agent credentials remain server-side.
25. As a developer, I want the first version to work even if the backend only accepts queued jobs, so that the UI can ship before streaming events exist.
26. As a developer, I want streaming or polling support to be additive, so that future backend session APIs can be connected without rewriting the page.
27. As a developer, I want the Agent UI state transitions to be testable from user-visible behavior, so that tests remain stable.
28. As a maintainer, I want `agentcn` influence to be documented as a UX reference, so that future contributors do not import unrelated runtime recipes by mistake.

## Implementation Decisions

- Build only the Web-facing Agent experience. Do not modify the API, Worker, shared Agent runtime selector, Claude Agent runtime, or Eve Agent runtime for this PRD.
- Treat the existing backend as the source of truth for Agent job intake. The front end submits user input to the backend and renders the returned acceptance metadata.
- Use the existing public API base URL environment variable. Do not introduce a second frontend configuration path.
- Keep runtime selection server-side. The Web app must not choose between Claude Agent runtime and Eve Agent runtime.
- Keep secrets server-side. The Web app must not read or render Agent provider API keys, search provider keys, or runtime credentials.
- Use the existing shared UI style and local component patterns. Do not import the `agentcn` documentation site, registry builder, or unrelated dependencies.
- Use `agentcn` as a UX reference for four interaction concepts: input composer, run log, event-specific rows, and artifact tabs.
- The first implementation may be non-streaming if the backend only returns Agent job acceptance. It should still leave a clear place in the UI for future run status and event history.
- Model frontend run state around user-visible phases: idle, submitting, accepted, failed, and completed when a backend completion signal exists.
- Render unknown future events defensively as raw or generic log entries instead of failing the whole console.
- Prefer simple browser and React primitives over new state-management libraries.
- Keep frontend Agent code inside the Web application because this is application-specific orchestration, not reusable runtime logic.
- Add a dedicated Web route for the Agent console. Navigation integration can remain minimal unless the project later adds a full app shell.
- Do not import `agentcn` Eve or Flue registry files into this project as part of the frontend implementation.
- Do not create a new package for the frontend Agent UI unless another app needs to consume the same UI.

## Testing Decisions

- Test external behavior, not component internals: a good test proves that a user can type a prompt, submit it, see accepted metadata, and see an error state when submission fails.
- The highest useful seam is the Web Agent console behavior with the backend call mocked at the network/client boundary.
- Unit-test the small frontend API client if it contains response parsing or error normalization.
- Component-test the console state transitions if the project already has React testing utilities available; otherwise keep tests at the pure client/helper seam and avoid adding a new testing stack for this feature alone.
- Reuse existing Web package validation commands as the baseline: lint, typecheck, test, and build.
- Follow the existing Web test style for library helpers, such as focused Vitest tests around public functions.
- Add coverage for empty prompt validation, successful acceptance, non-OK backend responses, and network errors.
- When streaming or polling is added later, add tests for event rendering at the event normalization seam rather than testing every visual row implementation.

## Out of Scope

- Building or changing backend Agent runtime behavior.
- Adding a new Agent runtime.
- Changing `AGENT_RUNTIME` selection rules.
- Importing `agentcn` Eve or Flue recipes.
- Running Eve tools from the browser.
- Adding SSE, WebSocket, or polling backend APIs if they do not already exist.
- Persisting Agent run history.
- Authentication, authorization, billing, rate limiting, and multi-user access control.
- A full dashboard or navigation shell redesign.
- A custom registry system for frontend Agent components.

## Further Notes

- Reference project: `https://github.com/shadcn-labs/agentcn`
- Frontend UX reference areas: Agent preview, event log rows, artifact tabs, and shadcn-style controls.
- The existing project glossary should be used in UI-adjacent docs: Agent job, Agent job intake, Agent runtime, Claude Agent runtime, and Eve Agent runtime.
- The implementation should stay intentionally thin because the backend Agent capability already exists in this project.
