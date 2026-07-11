import { z } from "zod";

export const AgentArtifactSchema = z.object({
  id: z.string(),
  label: z.string(),
  hint: z.string(),
  content: z.string(),
});

export const AgentRunEventSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("tool-call"),
    tool: z.string(),
    input: z.string(),
  }),
  z.object({ kind: z.literal("tool-result"), tool: z.string() }),
  z.object({ kind: z.literal("text"), text: z.string() }),
  z.object({ kind: z.literal("done"), result: z.string() }),
  z.object({ kind: z.literal("error"), message: z.string() }),
  z.object({
    kind: z.literal("artifacts"),
    tabs: z.array(AgentArtifactSchema),
  }),
  z.object({ kind: z.literal("unknown"), text: z.string() }),
]);

export type AgentArtifact = z.infer<typeof AgentArtifactSchema>;
export type AgentRunEvent = z.infer<typeof AgentRunEventSchema>;
