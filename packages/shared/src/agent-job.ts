import { z } from "zod";
import { AgentRunInputSchema } from "./agent-run";

export const agentJobName = "agent.run";
export const agentQueueName = "agent-jobs";

export const AgentJobNameSchema = z.literal(agentJobName);

export const AgentJobPayloadSchema = AgentRunInputSchema.extend({
  requestedAt: z.string().datetime(),
});

export const AgentJobAcceptedSchema = z.object({
  id: z.string().optional(),
  queue: z.string().min(1),
});

export type AgentJobName = z.infer<typeof AgentJobNameSchema>;
export type AgentJobPayload = z.infer<typeof AgentJobPayloadSchema>;
export type AgentJobAccepted = z.infer<typeof AgentJobAcceptedSchema>;
