import {
  AgentRunEventSchema,
  type AgentRunEvent as SharedAgentRunEvent,
  type AgentRunStatus as SharedAgentRunStatus,
} from "@agent-template/shared";
import { Prisma, type PrismaClient } from "../generated/client/client.js";

const storedRunInclude = {
  events: { orderBy: { sequence: "asc" as const } },
};

const toPrismaStatus = {
  queued: "QUEUED",
  running: "RUNNING",
  completed: "COMPLETED",
  failed: "FAILED",
  skipped: "SKIPPED",
  cancelled: "CANCELLED",
} as const;

const fromPrismaStatus = {
  QUEUED: "queued",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
  SKIPPED: "skipped",
  CANCELLED: "cancelled",
} as const satisfies Record<string, SharedAgentRunStatus>;

export function createPrismaAgentRunRepository(client: PrismaClient) {
  async function find(id: string) {
    const run = await client.agentRun.findUnique({
      where: { id },
      include: storedRunInclude,
    });
    return run ? mapStoredRun(run) : undefined;
  }

  return {
    async create(input: { id: string; prompt: string; requestedAt: Date }) {
      return mapStoredRun(
        await client.agentRun.create({
          data: { ...input, status: "QUEUED" },
          include: storedRunInclude,
        }),
      );
    },
    find,
    async tryStart(
      id: string,
      input: {
        runtime: "claude" | "eve";
        model: string;
        startedAt: Date;
      },
    ) {
      const updated = await client.agentRun.updateMany({
        where: { id, status: "QUEUED", cancelRequestedAt: null },
        data: { ...input, status: "RUNNING" },
      });
      return updated.count === 1 ? find(id) : undefined;
    },
    async appendEvent(
      runId: string,
      input: { sequence: number; event: SharedAgentRunEvent; createdAt: Date },
    ) {
      const payload = input.event as Prisma.InputJsonValue;
      await client.agentRunEvent.upsert({
        where: { runId_sequence: { runId, sequence: input.sequence } },
        create: {
          runId,
          sequence: input.sequence,
          kind: input.event.kind,
          payload,
          createdAt: input.createdAt,
        },
        update: { kind: input.event.kind, payload },
      });
    },
    async finish(
      id: string,
      input: {
        status: Exclude<SharedAgentRunStatus, "queued" | "running">;
        completedAt: Date;
        output?: string;
        reason?: string;
        sessionId?: string;
      },
    ) {
      await client.agentRun.updateMany({
        where: { id, status: { in: ["QUEUED", "RUNNING"] } },
        data: {
          status: toPrismaStatus[input.status],
          completedAt: input.completedAt,
          output: input.output ?? null,
          reason: input.reason ?? null,
          sessionId: input.sessionId ?? null,
        },
      });
      const run = await find(id);
      if (!run) throw new Error(`Agent run ${id} was not found`);
      return run;
    },
    async requestCancellation(id: string, requestedAt: Date) {
      const cancelled = await client.agentRun.updateMany({
        where: { id, status: "QUEUED" },
        data: {
          status: "CANCELLED",
          cancelRequestedAt: requestedAt,
          completedAt: requestedAt,
          reason: "Agent run was cancelled before execution",
        },
      });
      if (cancelled.count === 0) {
        await client.agentRun.updateMany({
          where: { id, status: "RUNNING" },
          data: { cancelRequestedAt: requestedAt },
        });
      }
      const run = await find(id);
      if (!run) throw new Error(`Agent run ${id} was not found`);
      return run;
    },
    async isCancellationRequested(id: string) {
      const run = await client.agentRun.findUnique({
        where: { id },
        select: { cancelRequestedAt: true, status: true },
      });
      return Boolean(
        run && (run.cancelRequestedAt || run.status === "CANCELLED"),
      );
    },
  };
}

function mapStoredRun(
  run: Prisma.AgentRunGetPayload<{ include: typeof storedRunInclude }>,
) {
  return {
    id: run.id,
    prompt: run.prompt,
    requestedAt: run.requestedAt,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    cancelRequestedAt: run.cancelRequestedAt,
    status: fromPrismaStatus[run.status],
    runtime:
      run.runtime === "claude"
        ? ("claude" as const)
        : run.runtime === "eve"
          ? ("eve" as const)
          : null,
    model: run.model,
    output: run.output,
    reason: run.reason,
    sessionId: run.sessionId,
    events: run.events.map((event) => ({
      sequence: event.sequence,
      event: AgentRunEventSchema.parse(event.payload),
      createdAt: event.createdAt,
    })),
  };
}
