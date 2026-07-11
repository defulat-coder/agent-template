import { z } from "zod";
import { AgentRunEventSchema } from "./agent-run-events";

export const AgentRunInputSchema = z.object({
  prompt: z.string().min(1),
});

export const AgentRunStatusSchema = z.enum([
  "queued",
  "running",
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
  sessionId: z.string().optional(),
});

export const AgentRunResultSchema = z.discriminatedUnion("status", [
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
  sessionId: z.string().nullable(),
  events: z.array(AgentRunRecordedEventSchema),
});

export type AgentRunInput = z.infer<typeof AgentRunInputSchema>;
export type AgentRunResult = z.infer<typeof AgentRunResultSchema>;
export type AgentRunRecordedEvent = z.infer<typeof AgentRunRecordedEventSchema>;
export type AgentRunStatus = z.infer<typeof AgentRunStatusSchema>;
export type AgentRunSnapshot = z.infer<typeof AgentRunSnapshotSchema>;
