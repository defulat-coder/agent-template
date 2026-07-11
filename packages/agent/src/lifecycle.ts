import { randomUUID } from "node:crypto";
import {
  AgentRunInputSchema,
  type AgentRunEvent,
  type AgentRunResult,
  type AgentRunSnapshot,
  type AgentRunStatus,
} from "@agent-template/shared";

export type StoredAgentRunEvent = {
  sequence: number;
  event: AgentRunEvent;
  createdAt: Date;
};

export type StoredAgentRun = {
  id: string;
  prompt: string;
  requestedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  cancelRequestedAt: Date | null;
  status: AgentRunStatus;
  runtime: "claude" | "eve" | null;
  model: string | null;
  output: string | null;
  reason: string | null;
  sessionId: string | null;
  events: StoredAgentRunEvent[];
};

export type AgentRunRepository = {
  create(input: {
    id: string;
    prompt: string;
    requestedAt: Date;
  }): Promise<StoredAgentRun>;
  find(id: string): Promise<StoredAgentRun | undefined>;
  tryStart(
    id: string,
    input: { runtime: "claude" | "eve"; model: string; startedAt: Date },
  ): Promise<StoredAgentRun | undefined>;
  appendEvent(id: string, input: StoredAgentRunEvent): Promise<void>;
  finish(
    id: string,
    input: {
      status: Exclude<AgentRunStatus, "queued" | "running">;
      completedAt: Date;
      output?: string;
      reason?: string;
      sessionId?: string;
    },
  ): Promise<StoredAgentRun>;
  requestCancellation(id: string, requestedAt: Date): Promise<StoredAgentRun>;
  isCancellationRequested(id: string): Promise<boolean>;
};

type ExecuteAgentRun = (
  input: unknown,
  env: Record<string, unknown>,
  options: {
    abortController?: AbortController;
    onEvent?: (event: AgentRunEvent) => void;
  },
) => Promise<AgentRunResult>;

export type AgentRunLifecycle = {
  queue(input: unknown): Promise<AgentRunSnapshot>;
  run(
    input: unknown,
    env: Record<string, unknown>,
    options?: AgentRunLifecycleExecutionOptions,
  ): Promise<AgentRunResult>;
  resume(
    runId: string,
    env: Record<string, unknown>,
    options?: AgentRunLifecycleExecutionOptions,
  ): Promise<AgentRunResult>;
  get(runId: string): Promise<AgentRunSnapshot | undefined>;
  cancel(runId: string): Promise<AgentRunSnapshot | undefined>;
  failQueued(runId: string, reason: string): Promise<AgentRunSnapshot>;
};

export type AgentRunLifecycleExecutionOptions = {
  abortSignal?: AbortSignal;
  onEvent?: (event: AgentRunEvent) => void;
};

export function createAgentRunLifecycle(input: {
  repository: AgentRunRepository;
  execute: ExecuteAgentRun;
  cancellationPollMs?: number;
  now?: () => Date;
}): AgentRunLifecycle {
  const now = input.now ?? (() => new Date());

  async function queue(runInput: unknown) {
    const parsed = AgentRunInputSchema.parse(runInput);
    const requestedAt = readRequestedAt(runInput) ?? now();
    return toSnapshot(
      await input.repository.create({
        id: randomUUID(),
        prompt: parsed.prompt,
        requestedAt,
      }),
    );
  }

  async function resume(
    runId: string,
    env: Record<string, unknown>,
    options: AgentRunLifecycleExecutionOptions = {},
  ): Promise<AgentRunResult> {
    const existing = await input.repository.find(runId);
    if (!existing) throw new Error(`Agent run ${runId} was not found`);

    const runtime = env.AGENT_RUNTIME === "eve" ? "eve" : "claude";
    const model = readRuntimeModel(env, runtime);
    const started = await input.repository.tryStart(runId, {
      runtime,
      model,
      startedAt: now(),
    });

    if (!started) {
      const current = await input.repository.find(runId);
      if (!current) throw new Error(`Agent run ${runId} was not found`);
      if (current.status === "queued" || current.status === "running") {
        throw new Error(`Agent run ${runId} is already ${current.status}`);
      }
      return resultFromStoredRun(current);
    }

    const controller = new AbortController();
    const removeExternalAbort = forwardAbortSignal(
      options.abortSignal,
      controller,
    );
    const stopCancellationPoll = pollCancellation(
      runId,
      controller,
      input.repository,
      input.cancellationPollMs ?? 250,
    );
    let sequence = started.events.length;
    let eventWrites = Promise.resolve();
    const emittedEvents: AgentRunEvent[] = [];

    try {
      const result = await input.execute({ prompt: started.prompt }, env, {
        abortController: controller,
        onEvent(event) {
          emittedEvents.push(event);
          const storedEvent = {
            sequence,
            event,
            createdAt: now(),
          };
          sequence += 1;
          eventWrites = eventWrites.then(() =>
            input.repository.appendEvent(runId, storedEvent),
          );
          options.onEvent?.(event);
        },
      });
      await eventWrites;

      if (controller.signal.aborted) {
        return finishCancelled(started, emittedEvents);
      }

      const completedAt = now();
      const session = result.sessionId ? { sessionId: result.sessionId } : {};
      const finished = await input.repository.finish(
        runId,
        result.status === "completed"
          ? {
              status: result.status,
              completedAt,
              output: result.output,
              ...session,
            }
          : {
              status: result.status,
              completedAt,
              reason: result.reason,
              ...session,
            },
      );
      return { ...result, runId: finished.id };
    } catch (error) {
      await eventWrites;
      if (controller.signal.aborted || isAbortError(error)) {
        return finishCancelled(started, emittedEvents);
      }

      const reason =
        error instanceof Error ? error.message : "Agent run failed";
      const event = { kind: "error", message: reason } satisfies AgentRunEvent;
      emittedEvents.push(event);
      await input.repository.appendEvent(runId, {
        sequence,
        event,
        createdAt: now(),
      });
      options.onEvent?.(event);
      const finished = await input.repository.finish(runId, {
        status: "failed",
        completedAt: now(),
        reason,
      });
      return resultFromStoredRun(finished);
    } finally {
      removeExternalAbort();
      stopCancellationPoll();
    }

    async function finishCancelled(
      run: StoredAgentRun,
      events: AgentRunEvent[],
    ): Promise<AgentRunResult> {
      const reason = "Agent run was cancelled";
      const event = { kind: "cancelled", reason } satisfies AgentRunEvent;
      if (
        !events.some(
          (item) => item.kind === "cancelled" && item.reason === reason,
        )
      ) {
        await input.repository.appendEvent(run.id, {
          sequence,
          event,
          createdAt: now(),
        });
        options.onEvent?.(event);
      }
      const finished = await input.repository.finish(run.id, {
        status: "cancelled",
        completedAt: now(),
        reason,
      });
      return resultFromStoredRun(finished);
    }
  }

  return {
    queue,
    async run(runInput, env, options) {
      const created = await queue(runInput);
      return resume(created.id, env, options);
    },
    resume,
    async get(runId) {
      const run = await input.repository.find(runId);
      return run ? toSnapshot(run) : undefined;
    },
    async cancel(runId) {
      const run = await input.repository.find(runId);
      if (!run) return undefined;
      const cancelled = await input.repository.requestCancellation(
        runId,
        now(),
      );
      if (
        cancelled.status === "cancelled" &&
        !cancelled.events.some((event) => event.event.kind === "cancelled")
      ) {
        await input.repository.appendEvent(runId, {
          sequence: cancelled.events.length,
          event: {
            kind: "cancelled",
            reason: cancelled.reason ?? "Agent run was cancelled",
          },
          createdAt: now(),
        });
        const updated = await input.repository.find(runId);
        if (updated) return toSnapshot(updated);
      }
      return toSnapshot(cancelled);
    },
    async failQueued(runId, reason) {
      return toSnapshot(
        await input.repository.finish(runId, {
          status: "failed",
          completedAt: now(),
          reason,
        }),
      );
    },
  };
}

function readRequestedAt(input: unknown) {
  if (
    typeof input === "object" &&
    input !== null &&
    "requestedAt" in input &&
    typeof input.requestedAt === "string"
  ) {
    const requestedAt = new Date(input.requestedAt);
    if (!Number.isNaN(requestedAt.getTime())) return requestedAt;
  }
  return undefined;
}

function readRuntimeModel(
  input: Record<string, unknown>,
  runtime: "claude" | "eve",
) {
  const value =
    runtime === "eve"
      ? (input.EVE_AGENT_MODEL ?? input.ANTHROPIC_MODEL)
      : (input.CLAUDE_AGENT_MODEL ?? input.ANTHROPIC_MODEL);
  return typeof value === "string" && value ? value : "unknown";
}

function forwardAbortSignal(
  signal: AbortSignal | undefined,
  controller: AbortController,
) {
  if (!signal) return () => undefined;
  const abort = () => controller.abort(signal.reason);
  if (signal.aborted) abort();
  else signal.addEventListener("abort", abort, { once: true });
  return () => signal.removeEventListener("abort", abort);
}

function pollCancellation(
  runId: string,
  controller: AbortController,
  repository: AgentRunRepository,
  intervalMs: number,
) {
  let checking = false;
  const interval = setInterval(() => {
    if (checking || controller.signal.aborted) return;
    checking = true;
    void repository
      .isCancellationRequested(runId)
      .then((requested) => {
        if (requested) controller.abort("Agent run cancellation requested");
      })
      .finally(() => {
        checking = false;
      });
  }, intervalMs);
  interval.unref?.();
  return () => clearInterval(interval);
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function resultFromStoredRun(run: StoredAgentRun): AgentRunResult {
  if (run.status === "queued" || run.status === "running") {
    throw new Error(`Agent run ${run.id} is not terminal`);
  }

  const base = {
    promptLength: run.prompt.length,
    runtime: run.runtime ?? "claude",
    configured: run.status !== "skipped",
    model: run.model ?? "unknown",
    runId: run.id,
    events: run.events.map((item) => item.event),
    ...(run.sessionId ? { sessionId: run.sessionId } : {}),
  };

  if (run.status === "completed") {
    return {
      ...base,
      status: run.status,
      output: requireTerminalValue(run, "output"),
    };
  }
  return {
    ...base,
    status: run.status,
    reason: requireTerminalValue(run, "reason"),
  };
}

function requireTerminalValue(run: StoredAgentRun, field: "output" | "reason") {
  const value = run[field];
  if (value !== null) return value;
  throw new Error(`Agent run ${run.id} ${run.status} is missing ${field}`);
}

function toSnapshot(run: StoredAgentRun): AgentRunSnapshot {
  return {
    id: run.id,
    prompt: run.prompt,
    requestedAt: run.requestedAt.toISOString(),
    startedAt: run.startedAt?.toISOString() ?? null,
    completedAt: run.completedAt?.toISOString() ?? null,
    cancelRequestedAt: run.cancelRequestedAt?.toISOString() ?? null,
    status: run.status,
    runtime: run.runtime,
    model: run.model,
    output: run.output,
    reason: run.reason,
    sessionId: run.sessionId,
    events: run.events.map((item) => item.event),
  };
}
