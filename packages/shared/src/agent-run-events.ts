import { z } from "zod";

export const AgentArtifactSchema = z.object({
  id: z.string(),
  label: z.string(),
  hint: z.string(),
  content: z.string(),
});

export const AgentInputOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  style: z.enum(["default", "primary", "danger"]).optional(),
});

export const AgentInputRequestSchema = z.object({
  requestId: z.string().min(1),
  type: z.enum(["approval", "question"]),
  prompt: z.string().min(1),
  options: z.array(AgentInputOptionSchema).optional(),
  allowFreeform: z.boolean().optional(),
  action: z
    .object({
      callId: z.string().min(1),
      toolName: z.string().min(1),
      input: z.json(),
    })
    .optional(),
});

export const AgentInputResponseSchema = z.object({
  requestId: z.string().min(1),
  optionId: z.string().min(1).optional(),
  text: z.string().min(1).optional(),
});

export const AgentRunEventSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("tool-call"),
    callId: z.string().min(1),
    toolName: z.string().min(1),
    input: z.json(),
  }),
  z.object({
    kind: z.literal("tool-result"),
    callId: z.string().min(1),
    toolName: z.string().min(1),
  }),
  z.object({ kind: z.literal("text"), text: z.string() }),
  z.object({ kind: z.literal("done"), result: z.string() }),
  z.object({ kind: z.literal("error"), message: z.string() }),
  z.object({ kind: z.literal("cancelled"), reason: z.string().min(1) }),
  z.strictObject({
    kind: z.literal("semantic-query"),
    callId: z.string().min(1),
    status: z.enum(["clarification", "unsupported", "result", "failed"]),
    queryId: z.string().min(1),
    catalog: z.string().min(1).optional(),
    catalogVersion: z.union([z.string().min(1), z.number()]).optional(),
    contractId: z.string().min(1).optional(),
    toolName: z.string().min(1).optional(),
    planHash: z.string().min(1).optional(),
    rowCount: z.number().int().nonnegative().optional(),
    durationMs: z.number().int().nonnegative().optional(),
    stage: z.enum(["result_validation", "tool_execution"]).optional(),
  }),
  z.object({
    kind: z.literal("input-request"),
    request: AgentInputRequestSchema,
  }),
  z.object({
    kind: z.literal("artifacts"),
    tabs: z.array(AgentArtifactSchema),
  }),
  z.object({ kind: z.literal("unknown"), text: z.string() }),
]);

export type AgentArtifact = z.infer<typeof AgentArtifactSchema>;
export type AgentInputOption = z.infer<typeof AgentInputOptionSchema>;
export type AgentInputRequest = z.infer<typeof AgentInputRequestSchema>;
export type AgentInputResponse = z.infer<typeof AgentInputResponseSchema>;
export type AgentRunEvent = z.infer<typeof AgentRunEventSchema>;

export function appendCompactedAgentRunEvent(
  events: AgentRunEvent[],
  event: AgentRunEvent,
) {
  const previous = events.at(-1);
  if (event.kind === "text" && previous?.kind === "text") {
    events[events.length - 1] = event;
    return;
  }
  events.push(event);
}
