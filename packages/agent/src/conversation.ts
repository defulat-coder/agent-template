import { randomUUID } from "node:crypto";
import {
  AgentConversationCreateInputSchema,
  AgentConversationListQuerySchema,
  AgentRunInputSchema,
  type AgentConversationListQuery,
  type AgentConversationPage,
  type AgentConversationSummary,
  type AgentConversationView,
  type AgentRunEvent,
  type AgentRunResult,
  type AgentRunSnapshot,
  type AgentRunSummary,
} from "@agent-template/shared";
import type { AgentRunLifecycle } from "./lifecycle.js";
import {
  AgentRuntimeContinuationSchema,
  type AgentRuntimeContinuation,
} from "./runtime-continuation.js";

export type StoredAgentConversation = {
  id: string;
  title: string | null;
  runtime: "claude" | "eve";
  runtimeContinuation: unknown;
  createdAt: Date;
  updatedAt: Date;
  runs: AgentRunSummary[];
};

export type AgentConversationRepository = {
  create(input: {
    id: string;
    title?: string;
    runtime: "claude" | "eve";
    createdAt: Date;
  }): Promise<StoredAgentConversation>;
  find(id: string): Promise<StoredAgentConversation | undefined>;
  list(input: AgentConversationListQuery): Promise<{
    items: StoredAgentConversation[];
    nextCursor: string | null;
  }>;
};

export type AgentConversationLifecycle = {
  create(
    input: unknown,
    runtime: "claude" | "eve",
  ): Promise<AgentConversationView>;
  get(conversationId: string): Promise<AgentConversationView | undefined>;
  list(query?: unknown): Promise<AgentConversationPage>;
  send(
    conversationId: string,
    input: unknown,
    env: Record<string, unknown>,
    options?: {
      abortSignal?: AbortSignal;
      onAccepted?: (run: AgentRunSnapshot) => void;
      onEvent?: (event: AgentRunEvent) => void;
    },
  ): Promise<AgentRunResult>;
};

export function createAgentConversationLifecycle(input: {
  repository: AgentConversationRepository;
  runs: AgentRunLifecycle;
  now?: () => Date;
}): AgentConversationLifecycle {
  const now = input.now ?? (() => new Date());

  return {
    async create(raw, runtime) {
      const parsed = AgentConversationCreateInputSchema.parse(raw ?? {});
      return toView(
        await input.repository.create({
          id: randomUUID(),
          runtime,
          createdAt: now(),
          ...(parsed.title ? { title: parsed.title } : {}),
        }),
      );
    },
    async get(conversationId) {
      const conversation = await input.repository.find(conversationId);
      return conversation ? toView(conversation) : undefined;
    },
    async list(raw) {
      const parsed = AgentConversationListQuerySchema.parse(raw ?? {});
      const page = await input.repository.list(parsed);
      return {
        items: page.items.map(toSummary),
        nextCursor: page.nextCursor,
      };
    },
    async send(conversationId, raw, env, options = {}) {
      const runInput = AgentRunInputSchema.parse(raw);
      const conversation = await input.repository.find(conversationId);
      if (!conversation) {
        throw new AgentConversationNotFoundError(conversationId);
      }
      const selectedRuntime = env.AGENT_RUNTIME === "eve" ? "eve" : "claude";
      if (selectedRuntime !== conversation.runtime) {
        throw new AgentConversationRuntimeConflictError(
          conversationId,
          conversation.runtime,
          selectedRuntime,
        );
      }
      const continuation = readContinuation(conversation.runtimeContinuation);
      const queued = await input.runs.queue(runInput, { conversationId });
      options.onAccepted?.(queued);
      return input.runs.resume(queued.id, env, {
        captureContinuation: true,
        ...(continuation ? { continuation } : {}),
        ...(options.abortSignal ? { abortSignal: options.abortSignal } : {}),
        ...(options.onEvent ? { onEvent: options.onEvent } : {}),
      });
    },
  };
}

export class AgentConversationNotFoundError extends Error {
  constructor(conversationId: string) {
    super(`Agent conversation ${conversationId} was not found`);
    this.name = "AgentConversationNotFoundError";
  }
}

export class AgentConversationRuntimeConflictError extends Error {
  constructor(conversationId: string, expected: string, actual: string) {
    super(
      `Agent conversation ${conversationId} belongs to ${expected}, not ${actual}`,
    );
    this.name = "AgentConversationRuntimeConflictError";
  }
}

function readContinuation(
  input: unknown,
): AgentRuntimeContinuation | undefined {
  if (input === null || input === undefined) return undefined;
  return AgentRuntimeContinuationSchema.parse(input);
}

function toSummary(
  conversation: StoredAgentConversation,
): AgentConversationSummary {
  return {
    id: conversation.id,
    title: conversation.title,
    runtime: conversation.runtime,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
    lastRun: conversation.runs[0] ?? null,
  };
}

function toView(conversation: StoredAgentConversation): AgentConversationView {
  return {
    ...toSummary(conversation),
    runs: conversation.runs,
  };
}
