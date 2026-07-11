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
  executionAttempt: number | null;
  event: AgentRunEvent;
  createdAt: Date;
};

type AgentRunEventWrite = Omit<StoredAgentRunEvent, "executionAttempt">;

export type StoredAgentRun = {
  id: string;
  prompt: string;
  requestedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  cancelRequestedAt: Date | null;
  status: AgentRunStatus;
  executionAttempt: number;
  executionToken: string | null;
  leaseExpiresAt: Date | null;
  heartbeatAt: Date | null;
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
  claim(
    id: string,
    input: {
      executionToken: string;
      runtime: "claude" | "eve";
      model: string;
      leaseDurationMs: number;
    },
  ): Promise<StoredAgentRun | undefined>;
  heartbeat(
    id: string,
    input: {
      executionToken: string;
      leaseDurationMs: number;
    },
  ): Promise<"active" | "cancelled" | "lost">;
  appendExecutionEvent(
    id: string,
    input: AgentRunEventWrite & { executionToken: string },
  ): Promise<boolean>;
  appendLifecycleEvent(id: string, input: AgentRunEventWrite): Promise<void>;
  finishExecution(
    id: string,
    input: {
      executionToken: string;
      status: Exclude<AgentRunStatus, "queued" | "running">;
      completedAt: Date;
      output?: string;
      reason?: string;
      sessionId?: string;
    },
  ): Promise<StoredAgentRun | undefined>;
  failQueued(
    id: string,
    input: { completedAt: Date; reason: string },
  ): Promise<StoredAgentRun>;
  requestCancellation(id: string, requestedAt: Date): Promise<StoredAgentRun>;
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

export const defaultAgentRunLeaseDurationMs = 60_000;

export function createAgentRunLifecycle(input: {
  repository: AgentRunRepository;
  execute: ExecuteAgentRun;
  cancellationPollMs?: number;
  leaseDurationMs?: number;
  now?: () => Date;
}): AgentRunLifecycle {
  const now = input.now ?? (() => new Date());
  const leaseDurationMs =
    input.leaseDurationMs ?? defaultAgentRunLeaseDurationMs;

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
    const executionToken = randomUUID();
    const started = await input.repository.claim(runId, {
      executionToken,
      runtime,
      model,
      leaseDurationMs,
    });

    if (!started) {
      let current = await input.repository.find(runId);
      if (!current) throw new Error(`Agent run ${runId} was not found`);
      if (current.status === "queued" || current.status === "running") {
        throw new Error(`Agent run ${runId} is already ${current.status}`);
      }
      if (
        current.status === "cancelled" &&
        !current.events.some((event) => event.event.kind === "cancelled")
      ) {
        await input.repository.appendLifecycleEvent(runId, {
          sequence: current.events.length,
          event: {
            kind: "cancelled",
            reason: current.reason ?? "Agent run was cancelled",
          },
          createdAt: now(),
        });
        current = (await input.repository.find(runId)) ?? current;
      }
      return resultFromStoredRun(current);
    }

    const controller = new AbortController();
    const removeExternalAbort = forwardAbortSignal(
      options.abortSignal,
      controller,
    );
    const stopExecutionMonitor = monitorExecution(
      runId,
      executionToken,
      controller,
      input.repository,
      input.cancellationPollMs ?? 250,
      leaseDurationMs,
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
          eventWrites = eventWrites.then(async () => {
            const appended = await input.repository.appendExecutionEvent(
              runId,
              { ...storedEvent, executionToken },
            );
            if (!appended) throw new AgentRunExecutionLeaseLostError(runId);
          });
          options.onEvent?.(event);
        },
      });
      await eventWrites;

      if (controller.signal.aborted) {
        if (isExecutionLeaseLost(controller.signal.reason)) {
          throw controller.signal.reason;
        }
        return finishCancelled(started, emittedEvents);
      }

      const completedAt = now();
      const session = result.sessionId ? { sessionId: result.sessionId } : {};
      const finished = await input.repository.finishExecution(
        runId,
        result.status === "completed"
          ? {
              executionToken,
              status: result.status,
              completedAt,
              output: result.output,
              ...session,
            }
          : {
              executionToken,
              status: result.status,
              completedAt,
              reason: result.reason,
              ...session,
            },
      );
      if (!finished) throw new AgentRunExecutionLeaseLostError(runId);
      return { ...result, runId: finished.id };
    } catch (error) {
      await eventWrites;
      if (
        isExecutionLeaseLost(error) ||
        isExecutionLeaseLost(controller.signal.reason)
      ) {
        throw new AgentRunExecutionLeaseLostError(runId);
      }
      if (controller.signal.aborted || isAbortError(error)) {
        return finishCancelled(started, emittedEvents);
      }

      const reason =
        error instanceof Error ? error.message : "Agent run failed";
      const event = { kind: "error", message: reason } satisfies AgentRunEvent;
      emittedEvents.push(event);
      const appended = await input.repository.appendExecutionEvent(runId, {
        executionToken,
        sequence,
        event,
        createdAt: now(),
      });
      if (!appended) throw new AgentRunExecutionLeaseLostError(runId);
      options.onEvent?.(event);
      const finished = await input.repository.finishExecution(runId, {
        executionToken,
        status: "failed",
        completedAt: now(),
        reason,
      });
      if (!finished) throw new AgentRunExecutionLeaseLostError(runId);
      return resultFromStoredRun(finished);
    } finally {
      removeExternalAbort();
      stopExecutionMonitor();
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
        const appended = await input.repository.appendExecutionEvent(run.id, {
          executionToken,
          sequence,
          event,
          createdAt: now(),
        });
        if (!appended) throw new AgentRunExecutionLeaseLostError(run.id);
        options.onEvent?.(event);
      }
      const finished = await input.repository.finishExecution(run.id, {
        executionToken,
        status: "cancelled",
        completedAt: now(),
        reason,
      });
      if (!finished) throw new AgentRunExecutionLeaseLostError(run.id);
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
        await input.repository.appendLifecycleEvent(runId, {
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
        await input.repository.failQueued(runId, {
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

function monitorExecution(
  runId: string,
  executionToken: string,
  controller: AbortController,
  repository: AgentRunRepository,
  intervalMs: number,
  leaseDurationMs: number,
) {
  let checking = false;
  const interval = setInterval(() => {
    if (checking || controller.signal.aborted) return;
    checking = true;
    void repository
      .heartbeat(runId, {
        executionToken,
        leaseDurationMs,
      })
      .then((state) => {
        if (state === "cancelled") {
          controller.abort("Agent run cancellation requested");
        }
        if (state === "lost") {
          controller.abort(new AgentRunExecutionLeaseLostError(runId));
        }
      })
      .catch(() => {
        controller.abort(new AgentRunExecutionLeaseLostError(runId));
      })
      .finally(() => {
        checking = false;
      });
  }, intervalMs);
  interval.unref?.();
  return () => clearInterval(interval);
}

class AgentRunExecutionLeaseLostError extends Error {
  constructor(runId: string) {
    super(`Agent run ${runId} execution lease was lost`);
    this.name = "AgentRunExecutionLeaseLostError";
  }
}

function isExecutionLeaseLost(error: unknown) {
  return error instanceof AgentRunExecutionLeaseLostError;
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
    executionAttempt: run.executionAttempt,
    leaseExpiresAt: run.leaseExpiresAt?.toISOString() ?? null,
    heartbeatAt: run.heartbeatAt?.toISOString() ?? null,
    runtime: run.runtime,
    model: run.model,
    output: run.output,
    reason: run.reason,
    sessionId: run.sessionId,
    events: run.events.map((item) => ({
      sequence: item.sequence,
      executionAttempt: item.executionAttempt,
      createdAt: item.createdAt.toISOString(),
      event: item.event,
    })),
  };
}
