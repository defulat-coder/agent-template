import { z } from "zod";
import {
  AgentInputResponseSchema,
  AgentRunEventSchema,
} from "./agent-run-events";

export const maxAgentSseBufferCharacters = 16 * 1024 * 1024;

export const AgentRunInputSchema = z.object({
  prompt: z.string().min(1),
  inputResponses: z.array(AgentInputResponseSchema).min(1).optional(),
});

export const AgentRunStatusSchema = z.enum([
  "queued",
  "running",
  "waiting",
  "completed",
  "failed",
  "skipped",
  "cancelled",
]);

export const AgentRunRecordedEventSchema = z.object({
  sequence: z.number().int().nonnegative(),
  executionAttempt: z.number().int().positive().nullable(),
  createdAt: z.string().datetime(),
  event: AgentRunEventSchema,
});

const AgentRunResultBaseSchema = z.object({
  promptLength: z.number().int().nonnegative(),
  runtime: z.enum(["claude", "eve"]),
  configured: z.boolean(),
  model: z.string(),
  runId: z.string().optional(),
  conversationId: z.string().optional(),
});

export const AgentRunResultSchema = z.discriminatedUnion("status", [
  AgentRunResultBaseSchema.extend({
    status: z.literal("waiting"),
    events: z.array(AgentRunEventSchema),
    reason: z.string().min(1),
  }),
  AgentRunResultBaseSchema.extend({
    status: z.literal("completed"),
    events: z.array(AgentRunEventSchema),
    output: z.string(),
  }),
  AgentRunResultBaseSchema.extend({
    status: z.literal("failed"),
    events: z.array(AgentRunEventSchema),
    reason: z.string().min(1),
  }),
  AgentRunResultBaseSchema.extend({
    status: z.literal("skipped"),
    reason: z.string().min(1),
    events: z.array(AgentRunEventSchema).optional(),
  }),
  AgentRunResultBaseSchema.extend({
    status: z.literal("cancelled"),
    events: z.array(AgentRunEventSchema),
    reason: z.string().min(1),
  }),
]);

export const AgentRunSnapshotSchema = z.object({
  id: z.string(),
  conversationId: z.string().nullable(),
  prompt: z.string(),
  requestedAt: z.string().datetime(),
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  cancelRequestedAt: z.string().datetime().nullable(),
  status: AgentRunStatusSchema,
  executionAttempt: z.number().int().nonnegative(),
  leaseExpiresAt: z.string().datetime().nullable(),
  heartbeatAt: z.string().datetime().nullable(),
  runtime: z.enum(["claude", "eve"]).nullable(),
  model: z.string().nullable(),
  output: z.string().nullable(),
  reason: z.string().nullable(),
  events: z.array(AgentRunRecordedEventSchema),
});

export const AgentRunSummarySchema = AgentRunSnapshotSchema.omit({
  events: true,
  output: true,
  prompt: true,
}).extend({
  promptPreview: z.string(),
});

export const AgentRunListQuerySchema = z.object({
  conversationId: z.string().min(1).optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  runtime: z.enum(["claude", "eve"]).optional(),
  status: z.array(AgentRunStatusSchema).optional(),
});

export const AgentRunPageSchema = z.object({
  items: z.array(AgentRunSummarySchema),
  nextCursor: z.string().nullable(),
});

export const AgentRunStreamFrameSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("accepted"),
    runId: z.string(),
    conversationId: z.string().optional(),
  }),
  z.object({
    type: z.literal("event"),
    runId: z.string(),
    sequence: z.number().int().nonnegative(),
    event: AgentRunEventSchema,
  }),
  z.object({
    type: z.literal("terminal"),
    runId: z.string(),
    result: AgentRunResultSchema,
  }),
]);

export type AgentRunInput = z.infer<typeof AgentRunInputSchema>;
export type AgentRunResult = z.infer<typeof AgentRunResultSchema>;
export type AgentRunRecordedEvent = z.infer<typeof AgentRunRecordedEventSchema>;
export type AgentRunStatus = z.infer<typeof AgentRunStatusSchema>;
export type AgentRunSnapshot = z.infer<typeof AgentRunSnapshotSchema>;
export type AgentRunSummary = z.infer<typeof AgentRunSummarySchema>;
export type AgentRunListQuery = z.infer<typeof AgentRunListQuerySchema>;
export type AgentRunPage = z.infer<typeof AgentRunPageSchema>;
export type AgentRunStreamFrame = z.infer<typeof AgentRunStreamFrameSchema>;
