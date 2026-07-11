import type {
  AgentConversationListQuery,
  AgentRunStatus,
} from "@agent-template/shared";
import { Prisma, type PrismaClient } from "../generated/client/client.js";

const runSummarySelect = {
  id: true,
  conversationId: true,
  prompt: true,
  requestedAt: true,
  startedAt: true,
  completedAt: true,
  cancelRequestedAt: true,
  status: true,
  executionAttempt: true,
  leaseExpiresAt: true,
  heartbeatAt: true,
  runtime: true,
  model: true,
  reason: true,
} as const;

const conversationInclude = {
  runs: {
    orderBy: [{ requestedAt: "desc" as const }, { id: "desc" as const }],
    select: runSummarySelect,
  },
} satisfies Prisma.AgentConversationInclude;

type RunSummaryRecord = {
  id: string;
  conversationId: string | null;
  prompt: string;
  requestedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  cancelRequestedAt: Date | null;
  status: keyof typeof fromPrismaStatus;
  executionAttempt: number;
  leaseExpiresAt: Date | null;
  heartbeatAt: Date | null;
  runtime: string | null;
  model: string | null;
  reason: string | null;
};

type ConversationRecord = {
  id: string;
  title: string | null;
  runtime: string;
  runtimeContinuationState: unknown;
  createdAt: Date;
  updatedAt: Date;
  runs: RunSummaryRecord[];
};

const fromPrismaStatus = {
  QUEUED: "queued",
  RUNNING: "running",
  WAITING: "waiting",
  COMPLETED: "completed",
  FAILED: "failed",
  SKIPPED: "skipped",
  CANCELLED: "cancelled",
} as const satisfies Record<string, AgentRunStatus>;

export function createPrismaAgentConversationRepository(client: PrismaClient) {
  async function find(id: string) {
    const conversation = await client.agentConversation.findUnique({
      where: { id },
      include: conversationInclude,
    });
    return conversation ? mapConversation(conversation) : undefined;
  }

  return {
    async create(input: {
      id: string;
      title?: string;
      runtime: "claude" | "eve";
      createdAt: Date;
    }) {
      return mapConversation(
        await client.agentConversation.create({
          data: {
            id: input.id,
            runtime: input.runtime,
            createdAt: input.createdAt,
            updatedAt: input.createdAt,
            ...(input.title ? { title: input.title } : {}),
          },
          include: conversationInclude,
        }),
      );
    },
    find,
    async list(input: AgentConversationListQuery) {
      const cursor = input.cursor ? decodeCursor(input.cursor) : undefined;
      const where = cursor
        ? ({
            OR: [
              { updatedAt: { lt: cursor.updatedAt } },
              { updatedAt: cursor.updatedAt, id: { lt: cursor.id } },
            ],
          } satisfies Prisma.AgentConversationWhereInput)
        : undefined;
      const conversations = await client.agentConversation.findMany({
        ...(where ? { where } : {}),
        include: {
          runs: {
            orderBy: [
              { requestedAt: "desc" as const },
              { id: "desc" as const },
            ],
            take: 1,
            select: runSummarySelect,
          },
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: input.limit + 1,
      });
      const hasNext = conversations.length > input.limit;
      const items = conversations.slice(0, input.limit);
      const last = items.at(-1);
      return {
        items: items.map(mapConversation),
        nextCursor:
          hasNext && last
            ? encodeCursor({ updatedAt: last.updatedAt, id: last.id })
            : null,
      };
    },
  };
}

function mapConversation(conversation: ConversationRecord) {
  const runtime =
    conversation.runtime === "eve" ? ("eve" as const) : ("claude" as const);
  return {
    id: conversation.id,
    title: conversation.title,
    runtime,
    runtimeContinuation: conversation.runtimeContinuationState,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    runs: conversation.runs.map((run) => ({
      id: run.id,
      conversationId: run.conversationId,
      promptPreview:
        run.prompt.length > 120 ? `${run.prompt.slice(0, 117)}...` : run.prompt,
      requestedAt: run.requestedAt.toISOString(),
      startedAt: run.startedAt?.toISOString() ?? null,
      completedAt: run.completedAt?.toISOString() ?? null,
      cancelRequestedAt: run.cancelRequestedAt?.toISOString() ?? null,
      status: fromPrismaStatus[run.status],
      executionAttempt: run.executionAttempt,
      leaseExpiresAt: run.leaseExpiresAt?.toISOString() ?? null,
      heartbeatAt: run.heartbeatAt?.toISOString() ?? null,
      runtime:
        run.runtime === "claude"
          ? ("claude" as const)
          : run.runtime === "eve"
            ? ("eve" as const)
            : null,
      model: run.model,
      reason: run.reason,
    })),
  };
}

function encodeCursor(input: { updatedAt: Date; id: string }) {
  return Buffer.from(
    JSON.stringify({ updatedAt: input.updatedAt.toISOString(), id: input.id }),
  ).toString("base64url");
}

function decodeCursor(cursor: string) {
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    );
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed.updatedAt !== "string" ||
      typeof parsed.id !== "string"
    ) {
      throw new Error("invalid cursor");
    }
    const updatedAt = new Date(parsed.updatedAt);
    if (Number.isNaN(updatedAt.getTime())) throw new Error("invalid cursor");
    return { updatedAt, id: parsed.id };
  } catch {
    throw new Error("Agent conversation cursor is invalid");
  }
}
