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
    expect(stored?.events.map((item) => item.event)).toEqual([
      { kind: "text", text: "Working" },
      { kind: "done", result: "Done" },
    ]);
    expect(
      stored?.events.map(({ sequence, executionAttempt }) => ({
        sequence,
        executionAttempt,
      })),
    ).toEqual([
      { sequence: 0, executionAttempt: 1 },
      { sequence: 1, executionAttempt: 1 },
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
    await expect(repository.find(queued.id)).resolves.toMatchObject({
      events: [{ executionAttempt: null }],
    });
  });

  it("reclaims an expired execution and fences the stale executor", async () => {
    const requestedAt = new Date("2026-07-11T00:00:00.000Z");
    let repositoryNow = requestedAt;
    const repository = createInMemoryRepository(() => repositoryNow);
    await repository.create({
      id: "run-lease",
      prompt: "Recover",
      requestedAt,
    });

    const first = await repository.claim("run-lease", {
      executionToken: "execution-1",
      runtime: "claude",
      model: "test-model",
      leaseDurationMs: 10_000,
    });
    expect(first?.executionAttempt).toBe(1);
    repositoryNow = new Date("2026-07-11T00:00:09.000Z");
    await expect(
      repository.claim("run-lease", {
        executionToken: "execution-2",
        runtime: "claude",
        model: "test-model",
        leaseDurationMs: 10_000,
      }),
    ).resolves.toBeUndefined();
    repositoryNow = new Date("2026-07-11T00:00:11.000Z");
    await expect(
      repository.heartbeat("run-lease", {
        executionToken: "execution-1",
        leaseDurationMs: 10_000,
      }),
    ).resolves.toBe("lost");

    const reclaimed = await repository.claim("run-lease", {
      executionToken: "execution-2",
      runtime: "claude",
      model: "test-model",
      leaseDurationMs: 10_000,
    });
    expect(reclaimed?.executionAttempt).toBe(2);
    await expect(
      repository.appendExecutionEvent("run-lease", {
        executionToken: "execution-1",
        sequence: 0,
        event: { kind: "text", text: "stale" },
        createdAt: new Date("2026-07-11T00:00:12.000Z"),
      }),
    ).resolves.toBe(false);
    await expect(
      repository.finishExecution("run-lease", {
        executionToken: "execution-1",
        status: "completed",
        completedAt: new Date("2026-07-11T00:00:12.000Z"),
        output: "stale",
      }),
    ).resolves.toBeUndefined();
    await expect(
      repository.appendExecutionEvent("run-lease", {
        executionToken: "execution-2",
        sequence: 0,
        event: { kind: "done", result: "recovered" },
        createdAt: new Date("2026-07-11T00:00:13.000Z"),
      }),
    ).resolves.toBe(true);
    await expect(
      repository.finishExecution("run-lease", {
        executionToken: "execution-2",
        status: "completed",
        completedAt: new Date("2026-07-11T00:00:14.000Z"),
        output: "recovered",
      }),
    ).resolves.toMatchObject({
      executionAttempt: 2,
      output: "recovered",
      status: "completed",
    });
    await expect(repository.find("run-lease")).resolves.toMatchObject({
      events: [{ executionAttempt: 2, sequence: 0 }],
    });
  });

  it("finalizes cancellation when a crashed execution lease expires", async () => {
    const requestedAt = new Date("2026-07-11T00:00:00.000Z");
    let repositoryNow = requestedAt;
    const repository = createInMemoryRepository(() => repositoryNow);
    const lifecycle = createAgentRunLifecycle({
      repository,
      execute: async () => {
        throw new Error("must not execute after cancellation");
      },
      now: () => new Date("2026-07-11T00:00:11.000Z"),
    });
    await repository.create({
      id: "run-cancelled-crash",
      prompt: "Cancel crashed run",
      requestedAt,
    });
    await repository.claim("run-cancelled-crash", {
      executionToken: "execution-1",
      runtime: "claude",
      model: "test-model",
      leaseDurationMs: 10_000,
    });
    await repository.requestCancellation(
      "run-cancelled-crash",
      new Date("2026-07-11T00:00:05.000Z"),
    );
    repositoryNow = new Date("2026-07-11T00:00:11.000Z");

    await expect(
      lifecycle.resume("run-cancelled-crash", {}),
    ).resolves.toMatchObject({
      events: [
        {
          kind: "cancelled",
          reason: "Agent run was cancelled after its execution lease expired",
        },
      ],
      status: "cancelled",
    });
  });
});

function createInMemoryRepository(now = () => new Date()): AgentRunRepository {
  const runs = new Map<string, StoredAgentRun>();
  return {
    async create(input) {
      const run: StoredAgentRun = {
        ...input,
        conversationId: input.conversationId ?? null,
        startedAt: null,
        completedAt: null,
        cancelRequestedAt: null,
        status: "queued",
        executionAttempt: 0,
        executionToken: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
        runtime: null,
        model: null,
        output: null,
        reason: null,
        runtimeSessionId: null,
        events: [],
      };
      runs.set(run.id, run);
      return run;
    },
    async find(id) {
      return runs.get(id);
    },
    async list(input) {
      const items = [...runs.values()].slice(0, input.limit);
      return { items, nextCursor: null };
    },
    async claim(id, input) {
      const run = runs.get(id);
      const claimedAt = now();
      const reclaimable =
        run?.status === "running" &&
        run.leaseExpiresAt !== null &&
        run.leaseExpiresAt <= claimedAt;
      if (run && reclaimable && run.cancelRequestedAt) {
        Object.assign(run, {
          status: "cancelled" as const,
          completedAt: claimedAt,
          reason: "Agent run was cancelled after its execution lease expired",
          executionToken: null,
          leaseExpiresAt: null,
        });
        return undefined;
      }
      if (
        !run ||
        (run.status !== "queued" && !reclaimable) ||
        run.cancelRequestedAt
      )
        return undefined;
      Object.assign(run, {
        ...input,
        executionAttempt: run.executionAttempt + 1,
        heartbeatAt: claimedAt,
        leaseExpiresAt: new Date(claimedAt.getTime() + input.leaseDurationMs),
        startedAt: run.startedAt ?? claimedAt,
        status: "running" as const,
      });
      return run;
    },
    async heartbeat(id, input) {
      const run = runs.get(id);
      const heartbeatAt = now();
      if (
        !run ||
        run.status !== "running" ||
        run.executionToken !== input.executionToken ||
        !run.leaseExpiresAt ||
        run.leaseExpiresAt <= heartbeatAt
      ) {
        return "lost";
      }
      if (run.cancelRequestedAt) return "cancelled";
      run.heartbeatAt = heartbeatAt;
      run.leaseExpiresAt = new Date(
        heartbeatAt.getTime() + input.leaseDurationMs,
      );
      return "active";
    },
    async appendExecutionEvent(id, input) {
      const run = runs.get(id);
      if (
        !run ||
        run.status !== "running" ||
        run.executionToken !== input.executionToken ||
        !run.leaseExpiresAt ||
        run.leaseExpiresAt <= now() ||
        run.events.some((event) => event.sequence === input.sequence)
      ) {
        return false;
      }
      run.events.push({
        sequence: input.sequence,
        executionAttempt: run.executionAttempt,
        event: input.event,
        createdAt: input.createdAt,
      });
      return true;
    },
    async appendLifecycleEvent(id, input) {
      const run = runs.get(id);
      if (!run || run.status !== "cancelled") throw new Error("missing run");
      if (!run.events.some((event) => event.sequence === input.sequence)) {
        run.events.push({ ...input, executionAttempt: null });
      }
    },
    async finishExecution(id, input) {
      const run = runs.get(id);
      if (
        !run ||
        run.status !== "running" ||
        run.executionToken !== input.executionToken ||
        !run.leaseExpiresAt ||
        run.leaseExpiresAt <= now()
      ) {
        return undefined;
      }
      Object.assign(run, input, {
        executionToken: null,
        leaseExpiresAt: null,
      });
      return run;
    },
    async failQueued(id, input) {
      const run = runs.get(id);
      if (!run) throw new Error("missing run");
      if (run.status === "queued") {
        Object.assign(run, input, { status: "failed" as const });
      }
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
  };
}

async function waitFor(predicate: () => Promise<boolean>) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error("condition not reached");
}
