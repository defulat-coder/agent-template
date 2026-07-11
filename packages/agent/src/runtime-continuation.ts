import { z } from "zod";
import type { AgentRunResult } from "@agent-template/shared";

export const AgentRuntimeContinuationSchema = z.discriminatedUnion("runtime", [
  z.object({
    runtime: z.literal("claude"),
    sessionId: z.string().min(1),
  }),
  z.object({
    runtime: z.literal("eve"),
    sessionState: z.object({
      continuationToken: z.string().optional(),
      sessionId: z.string().optional(),
      streamIndex: z.number().int().nonnegative(),
    }),
  }),
]);

export type AgentRuntimeContinuation = z.infer<
  typeof AgentRuntimeContinuationSchema
>;

export type AgentExecutionResult = AgentRunResult & {
  runtimeContinuation?: AgentRuntimeContinuation;
  runtimeSessionId?: string;
};
