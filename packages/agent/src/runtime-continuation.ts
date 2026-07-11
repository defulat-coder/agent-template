import { z } from "zod";
import {
  AgentInputRequestSchema,
  type AgentRunResult,
} from "@agent-template/shared";

export const AgentRuntimeContinuationSchema = z.discriminatedUnion("runtime", [
  z.object({
    runtime: z.literal("claude"),
    sessionId: z.string().min(1),
    pendingInput: z
      .object({
        toolUseId: z.string().min(1),
        toolName: z.string().min(1),
        toolInput: z.json(),
        requests: z.array(AgentInputRequestSchema).min(1),
      })
      .optional(),
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
