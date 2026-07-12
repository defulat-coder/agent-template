import { randomUUID } from "node:crypto";
import {
  appendCompactedAgentRunEvent,
  AgentRunInputSchema,
  AgentRunListQuerySchema,
  AgentRunResultSchema,
  AgentRunSummarySchema,
  type AgentInputResponse,
  type AgentRunEvent,
  type AgentRunListQuery,
  type AgentRunPage,
  type AgentRunRecordedEvent,
  type AgentRunResult,
  type AgentRunSnapshot,
  type AgentRunSummary,
  type AgentRunStatus,
} from "@agent-template/shared";
import type {
  AgentExecutionResult,
  AgentRuntimeContinuation,
} from "./runtime-continuation.js";

export type StoredAgentRunEvent = {
  sequence: number;
  executionAttempt: number | null;
  event: AgentRunEvent;
  createdAt: Date;
};

type AgentRunEventWrite = Omit<StoredAgentRunEvent, "executionAttempt">;
const maxPendingAgentRunEvents = 1_000;

export type StoredAgentRun = {
  id: string;
  conversationId: string | null;
  prompt: string;
  inputResponses: AgentInputResponse[] | null;
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
  runtimeSessionId: string | null;
  events: StoredAgentRunEvent[];
};

export type StoredAgentRunObservation = Pick<
  StoredAgentRun,
  "id" | "status"
> & {
  events: StoredAgentRunEvent[];
};

export type AgentRunRepository = {
  create(input: {
    id: string;
    prompt: string;
    inputResponses?: AgentInputResponse[];
    requestedAt: Date;
    conversationId?: string;
  }): Promise<StoredAgentRun>;
  find(id: string): Promise<StoredAgentRun | undefined>;
  observe(
    id: string,
    afterSequence: number,
  ): Promise<StoredAgentRunObservation | undefined>;
  list(input: AgentRunListQuery): Promise<{
    items: StoredAgentRun[];
    nextCursor: string | null;
  }>;
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
      runtimeSessionId?: string;
      runtimeContinuation?: AgentRuntimeContinuation;
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
    captureContinuation?: boolean;
    continuation?: AgentRuntimeContinuation;
    onEvent?: (event: AgentRunEvent) => void;
  },
) => Promise<AgentExecutionResult>;

export type AgentRunLifecycle = {
  queue(
    input: unknown,
    options?: AgentRunLifecycleQueueOptions,
  ): Promise<AgentRunSnapshot>;
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
  observe(
    runId: string,
    afterSequence: number,
  ): Promise<AgentRunObservation | undefined>;
  list(query?: unknown): Promise<AgentRunPage>;
  cancel(runId: string): Promise<AgentRunSnapshot | undefined>;
  failQueued(runId: string, reason: string): Promise<AgentRunSnapshot>;
};

export type AgentRunObservation =
  | {
      runId: string;
      terminal: false;
      events: AgentRunRecordedEvent[];
    }
  | {
      runId: string;
      terminal: true;
      events: AgentRunRecordedEvent[];
      result: AgentRunResult;
    };

export type AgentRunLifecycleExecutionOptions = {
  abortSignal?: AbortSignal;
  captureContinuation?: boolean;
  continuation?: AgentRuntimeContinuation;
  conversationId?: string;
  onEvent?: (event: AgentRunEvent) => void;
};

export type AgentRunLifecycleQueueOptions = {
  conversationId?: string;
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

  async function queue(
    runInput: unknown,
    options: AgentRunLifecycleQueueOptions = {},
  ) {
    const parsed = AgentRunInputSchema.parse(runInput);
    const requestedAt = readRequestedAt(runInput) ?? now();
    return toSnapshot(
      await input.repository.create({
        id: randomUUID(),
        prompt: parsed.prompt,
        ...(parsed.inputResponses
          ? { inputResponses: parsed.inputResponses }
          : {}),
        requestedAt,
        ...(options.conversationId
          ? { conversationId: options.conversationId }
          : {}),
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
    const emittedEvents: AgentRunEvent[] = [];
    const eventWriter = createExecutionEventWriter({
      initialSequence: started.events.length,
      onFailure(error) {
        controller.abort(error);
      },
      async write(storedEvent) {
        const appended = await input.repository.appendExecutionEvent(runId, {
          ...storedEvent,
          executionToken,
        });
        if (!appended) throw new AgentRunExecutionLeaseLostError(runId);
      },
    });

    try {
      const result = await input.execute(
        {
          prompt: started.prompt,
          ...(started.inputResponses
            ? { inputResponses: started.inputResponses }
            : {}),
        },
        env,
        {
          abortController: controller,
          ...(options.captureContinuation !== undefined
            ? { captureContinuation: options.captureContinuation }
            : {}),
          ...(options.continuation
            ? { continuation: options.continuation }
            : {}),
          onEvent(event) {
            appendCompactedAgentRunEvent(emittedEvents, event);
            eventWriter.push(event, now());
            options.onEvent?.(event);
          },
        },
      );
      await eventWriter.flush();

      if (controller.signal.aborted) {
        if (isExecutionLeaseLost(controller.signal.reason)) {
          throw controller.signal.reason;
        }
        return finishCancelled(started, emittedEvents);
      }

      const completedAt = now();
      const runtimeSession = result.runtimeSessionId
        ? { runtimeSessionId: result.runtimeSessionId }
        : {};
      const continuation = result.runtimeContinuation
        ? { runtimeContinuation: result.runtimeContinuation }
        : {};
      const finished = await input.repository.finishExecution(
        runId,
        result.status === "completed"
          ? {
              executionToken,
              status: result.status,
              completedAt,
              output: result.output,
              ...runtimeSession,
              ...continuation,
            }
          : {
              executionToken,
              status: result.status,
              completedAt,
              reason: result.reason,
              ...runtimeSession,
              ...continuation,
            },
      );
      if (!finished) throw new AgentRunExecutionLeaseLostError(runId);
      return AgentRunResultSchema.parse({
        ...result,
        runId: finished.id,
        ...(finished.conversationId
          ? { conversationId: finished.conversationId }
          : {}),
      });
    } catch (caughtError) {
      let error = caughtError;
      try {
        await eventWriter.flush();
      } catch (writeError) {
        error = writeError;
      }
      if (
        isExecutionLeaseLost(error) ||
        isExecutionLeaseLost(controller.signal.reason)
      ) {
        throw new AgentRunExecutionLeaseLostError(runId);
      }
      if (
        (controller.signal.aborted || isAbortError(error)) &&
        !(controller.signal.reason instanceof Error)
      ) {
        return finishCancelled(started, emittedEvents);
      }

      const reason =
        error instanceof Error ? error.message : "Agent run failed";
      const event = { kind: "error", message: reason } satisfies AgentRunEvent;
      appendCompactedAgentRunEvent(emittedEvents, event);
      const appended = await input.repository.appendExecutionEvent(runId, {
        executionToken,
        sequence: eventWriter.nextSequence(),
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
          sequence: eventWriter.nextSequence(),
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
      const created = await queue(runInput, {
        ...(options?.conversationId
          ? { conversationId: options.conversationId }
          : {}),
      });
      return resume(created.id, env, options);
    },
    resume,
    async get(runId) {
      const run = await input.repository.find(runId);
      return run ? toSnapshot(run) : undefined;
    },
    async observe(runId, afterSequence) {
      if (!Number.isSafeInteger(afterSequence) || afterSequence < -1) {
        throw new Error(
          "Agent run observation cursor must be an integer >= -1",
        );
      }
      const observation = await input.repository.observe(runId, afterSequence);
      if (!observation) return undefined;
      const events = observation.events.map(toRecordedEvent);
      if (observation.status === "queued" || observation.status === "running") {
        return { runId, terminal: false, events };
      }
      const terminalRun = await input.repository.find(runId);
      if (!terminalRun) {
        throw new Error(`Agent run ${runId} disappeared during observation`);
      }
      return {
        runId,
        terminal: true,
        events: terminalRun.events
          .filter((event) => event.sequence > afterSequence)
          .map(toRecordedEvent),
        result: resultFromStoredRun(terminalRun),
      };
    },
    async list(query) {
      const parsed = AgentRunListQuerySchema.parse(query ?? {});
      const page = await input.repository.list(parsed);
      return {
        items: page.items.map(toSummary),
        nextCursor: page.nextCursor,
      };
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

function createExecutionEventWriter(input: {
  initialSequence: number;
  onFailure(error: unknown): void;
  write(event: AgentRunEventWrite): Promise<void>;
}) {
  let pending: Array<{ event: AgentRunEvent; createdAt: Date }> = [];
  let pendingHead = 0;
  let sequence = input.initialSequence;
  let draining: Promise<void> | undefined;
  let failure: unknown;

  const fail = (error: unknown) => {
    if (failure !== undefined) return;
    failure = error;
    pending = [];
    pendingHead = 0;
    input.onFailure(error);
  };

  const pendingSize = () => pending.length - pendingHead;

  const startDrain = () => {
    if (draining || failure !== undefined || pendingSize() === 0) return;
    draining = drain()
      .catch((error: unknown) => {
        fail(error);
      })
      .finally(() => {
        draining = undefined;
        startDrain();
      });
  };

  const push = (event: AgentRunEvent, createdAt: Date) => {
    if (failure !== undefined) return;
    const previous = pending.at(-1);
    if (
      pendingSize() > 0 &&
      event.kind === "text" &&
      previous?.event.kind === "text"
    ) {
      previous.event = event;
      previous.createdAt = createdAt;
    } else {
      if (pendingSize() >= maxPendingAgentRunEvents) {
        fail(
          new Error(
            `Agent run event backlog exceeded ${maxPendingAgentRunEvents}`,
          ),
        );
        return;
      }
      pending.push({ event, createdAt });
    }
    startDrain();
  };

  const flush = async () => {
    while (draining || pendingSize() > 0) {
      startDrain();
      if (draining) await draining;
    }
    if (failure !== undefined) throw failure;
  };

  async function drain() {
    while (pendingHead < pending.length && failure === undefined) {
      const current = pending[pendingHead];
      if (!current) break;
      pendingHead += 1;
      await input.write({ ...current, sequence });
      sequence += 1;
    }
    if (pendingHead === pending.length) {
      pending = [];
      pendingHead = 0;
    }
  }

  return {
    flush,
    nextSequence: () => sequence,
    push,
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
    ...(run.conversationId ? { conversationId: run.conversationId } : {}),
    events: run.events.map((item) => item.event),
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
    conversationId: run.conversationId,
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
    events: run.events.map(toRecordedEvent),
  };
}

function toRecordedEvent(item: StoredAgentRunEvent): AgentRunRecordedEvent {
  return {
    sequence: item.sequence,
    executionAttempt: item.executionAttempt,
    createdAt: item.createdAt.toISOString(),
    event: item.event,
  };
}

function toSummary(run: StoredAgentRun): AgentRunSummary {
  const snapshot = toSnapshot(run);
  return AgentRunSummarySchema.parse({
    ...snapshot,
    promptPreview:
      run.prompt.length > 120 ? `${run.prompt.slice(0, 117)}...` : run.prompt,
  });
}
