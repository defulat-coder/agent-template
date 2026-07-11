import { z } from "zod";
import { AgentRunSummarySchema } from "./agent-run";

export const AgentConversationCreateInputSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
});

export const AgentConversationSummarySchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  runtime: z.enum(["claude", "eve"]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lastRun: AgentRunSummarySchema.nullable(),
});

export const AgentConversationViewSchema =
  AgentConversationSummarySchema.extend({
    runs: z.array(AgentRunSummarySchema),
  });

export const AgentConversationListQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const AgentConversationPageSchema = z.object({
  items: z.array(AgentConversationSummarySchema),
  nextCursor: z.string().nullable(),
});

export type AgentConversationCreateInput = z.infer<
  typeof AgentConversationCreateInputSchema
>;
export type AgentConversationSummary = z.infer<
  typeof AgentConversationSummarySchema
>;
export type AgentConversationView = z.infer<typeof AgentConversationViewSchema>;
export type AgentConversationListQuery = z.infer<
  typeof AgentConversationListQuerySchema
>;
export type AgentConversationPage = z.infer<typeof AgentConversationPageSchema>;

export class AgentConversationBusyError extends Error {
  constructor(conversationId: string, options?: ErrorOptions) {
    super(
      `Agent conversation ${conversationId} already has an active Agent run`,
      options,
    );
    this.name = "AgentConversationBusyError";
  }
}
