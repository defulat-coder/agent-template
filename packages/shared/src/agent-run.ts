import { z } from "zod";
import { AgentRunEventSchema } from "./agent-run-events";

export const AgentRunInputSchema = z.object({
  prompt: z.string().min(1),
});

export const AgentRunResultSchema = z.object({
  promptLength: z.number().int().nonnegative(),
  runtime: z.enum(["claude", "eve"]),
  configured: z.boolean(),
  model: z.string(),
  status: z.enum(["skipped", "completed", "failed"]),
  events: z.array(AgentRunEventSchema).optional(),
  output: z.string().optional(),
  reason: z.string().optional(),
  sessionId: z.string().optional(),
});

export type AgentRunInput = z.infer<typeof AgentRunInputSchema>;
export type AgentRunResult = z.infer<typeof AgentRunResultSchema>;
