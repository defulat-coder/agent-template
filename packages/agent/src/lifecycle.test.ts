import { describe, expect, it } from "vitest";
import {
  createAgentRunLifecycle,
  type AgentRunRepository,
  type StoredAgentRun,
} from "./lifecycle.js";

describe("Agent run lifecycle", () => {
  it("persists an ordered Agent run from queued through completed", async () => {
    const repository = createInMemoryRepository();
    const lifecycle = createAgentRunLifecycle({
      repository,
      async execute(input, _env, options) {
        options.onEvent?.({ kind: "text", text: "Working" });
        options.onEvent?.({ kind: "done", result: "Done" });
        return {
          configured: true,
          events: [
            { kind: "text", text: "Working" },
            { kind: "done", result: "Done" },
          ],
          model: "test-model",
          output: "Done",
          promptLength: (input as { prompt: string }).prompt.length,
          runtime: "claude",
          status: "completed",
        };
      },
    });

    const queued = await lifecycle.queue({
      prompt: "Run agent",
      requestedAt: "2026-07-11T00:00:00.000Z",
    });
    const result = await lifecycle.resume(queued.id, {
      AGENT_RUNTIME: "claude",
      CLAUDE_AGENT_MODEL: "test-model",
    });
    const stored = await lifecycle.get(queued.id);

    expect(result).toMatchObject({
      output: "Done",
      runId: queued.id,
      status: "completed",
    });
    expect(stored).toMatchObject({
      id: queued.id,
      status: "completed",
      output: "Done",
      runtime: "claude",
      model: "test-model",
    });
    expect(stored?.events).toEqual([
      { kind: "text", text: "Working" },
      { kind: "done", result: "Done" },
    ]);
  });

  it("cancels a running Agent run through the runtime abort controller", async () => {
    const repository = createInMemoryRepository();
    const lifecycle = createAgentRunLifecycle({
      repository,
      cancellationPollMs: 1,
      execute: async (_input, _env, options) =>
        new Promise<never>((_resolve, reject) => {
          const signal = options.abortController?.signal;
          signal?.addEventListener(
            "abort",
            () => reject(new DOMException("cancelled", "AbortError")),
            { once: true },
          );
        }),
    });
    const queued = await lifecycle.queue({ prompt: "Wait" });
    const running = lifecycle.resume(queued.id, {
      AGENT_RUNTIME: "claude",
      CLAUDE_AGENT_MODEL: "test-model",
    });

    await waitFor(
      async () => (await lifecycle.get(queued.id))?.status === "running",
    );
    await lifecycle.cancel(queued.id);

    await expect(running).resolves.toMatchObject({
      events: [{ kind: "cancelled", reason: "Agent run was cancelled" }],
      runId: queued.id,
      status: "cancelled",
    });
    await expect(lifecycle.get(queued.id)).resolves.toMatchObject({
      cancelRequestedAt: expect.any(String),
      status: "cancelled",
    });
  });

  it("does not execute a queued Agent run after cancellation", async () => {
    const repository = createInMemoryRepository();
    let executions = 0;
    const lifecycle = createAgentRunLifecycle({
      repository,
      execute: async () => {
        executions += 1;
        throw new Error("must not execute");
      },
    });
    const queued = await lifecycle.queue({ prompt: "Cancel me" });

    await lifecycle.cancel(queued.id);
    await expect(lifecycle.resume(queued.id, {})).resolves.toMatchObject({
      events: [
        {
          kind: "cancelled",
          reason: "Agent run was cancelled before execution",
        },
      ],
      runId: queued.id,
      status: "cancelled",
    });
    expect(executions).toBe(0);
  });
});

function createInMemoryRepository(): AgentRunRepository {
  const runs = new Map<string, StoredAgentRun>();
  return {
    async create(input) {
      const run: StoredAgentRun = {
        ...input,
        startedAt: null,
        completedAt: null,
        cancelRequestedAt: null,
        status: "queued",
        runtime: null,
        model: null,
        output: null,
        reason: null,
        sessionId: null,
        events: [],
      };
      runs.set(run.id, run);
      return run;
    },
    async find(id) {
      return runs.get(id);
    },
    async tryStart(id, input) {
      const run = runs.get(id);
      if (!run || run.status !== "queued" || run.cancelRequestedAt)
        return undefined;
      Object.assign(run, input, { status: "running" as const });
      return run;
    },
    async appendEvent(id, event) {
      runs.get(id)?.events.push(event);
    },
    async finish(id, input) {
      const run = runs.get(id);
      if (!run) throw new Error("missing run");
      Object.assign(run, input);
      return run;
    },
    async requestCancellation(id, requestedAt) {
      const run = runs.get(id);
      if (!run) throw new Error("missing run");
      run.cancelRequestedAt = requestedAt;
      if (run.status === "queued") {
        run.status = "cancelled";
        run.completedAt = requestedAt;
        run.reason = "Agent run was cancelled before execution";
      }
      return run;
    },
    async isCancellationRequested(id) {
      return Boolean(runs.get(id)?.cancelRequestedAt);
    },
  };
}

async function waitFor(predicate: () => Promise<boolean>) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error("condition not reached");
}
