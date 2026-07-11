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

export const AgentRunResultSchema = z.object({
  promptLength: z.number().int().nonnegative(),
  runtime: z.enum(["claude", "eve"]),
  configured: z.boolean(),
  model: z.string(),
  status: z.enum(["skipped", "completed", "failed", "cancelled"]),
  events: z.array(AgentRunEventSchema).optional(),
  output: z.string().optional(),
  reason: z.string().optional(),
  runId: z.string().optional(),
  sessionId: z.string().optional(),
});

export const AgentRunSnapshotSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  requestedAt: z.string().datetime(),
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  cancelRequestedAt: z.string().datetime().nullable(),
  status: AgentRunStatusSchema,
  runtime: z.enum(["claude", "eve"]).nullable(),
  model: z.string().nullable(),
  output: z.string().nullable(),
  reason: z.string().nullable(),
  sessionId: z.string().nullable(),
  events: z.array(AgentRunEventSchema),
});

export type AgentRunInput = z.infer<typeof AgentRunInputSchema>;
export type AgentRunResult = z.infer<typeof AgentRunResultSchema>;
export type AgentRunStatus = z.infer<typeof AgentRunStatusSchema>;
export type AgentRunSnapshot = z.infer<typeof AgentRunSnapshotSchema>;
