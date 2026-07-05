import { z } from "zod";

export const AgentArtifactSchema = z.object({
  id: z.string(),
  label: z.string(),
  hint: z.string(),
  content: z.string()
});

export const AgentRunsDashboardDataSchema = z.object({
  metrics: z.object({
    totalRuns: z.number(),
    completedRuns: z.number(),
    failedRuns: z.number(),
    failureRate: z.number()
  }),
  runs: z.array(
    z.object({
      runId: z.string(),
      eventCount: z.number(),
      terminalEvent: z.string().nullable(),
      firstEventAt: z.string(),
      lastEventAt: z.string()
    })
  )
});

const JsonRenderPatchSchema = z.union([
  z.object({ op: z.literal("add"), path: z.string(), value: z.unknown() }),
  z.object({ op: z.literal("replace"), path: z.string(), value: z.unknown() }),
  z.object({ op: z.literal("remove"), path: z.string() }),
  z.object({ from: z.string(), op: z.literal("move"), path: z.string() }),
  z.object({ from: z.string(), op: z.literal("copy"), path: z.string() }),
  z.object({ op: z.literal("test"), path: z.string(), value: z.unknown() })
]);

export const AgentRunsDashboardUiSchema = z.object({
  component: z.literal("agent-runs-dashboard"),
  title: z.string(),
  data: AgentRunsDashboardDataSchema
});

export const AgentJsonRenderUiPatchSchema = z.object({
  component: z.literal("json-render"),
  id: z.string(),
  patch: JsonRenderPatchSchema,
  title: z.string()
});

export const AgentRunUiSchema = z.discriminatedUnion("component", [
  AgentRunsDashboardUiSchema,
  AgentJsonRenderUiPatchSchema
]);

export const AgentRunEventSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("tool-call"), tool: z.string(), input: z.string() }),
  z.object({ kind: z.literal("tool-result"), tool: z.string() }),
  z.object({ kind: z.literal("text"), text: z.string() }),
  z.object({ kind: z.literal("ui"), ui: AgentRunUiSchema }),
  z.object({ kind: z.literal("done"), result: z.string() }),
  z.object({ kind: z.literal("error"), message: z.string() }),
  z.object({ kind: z.literal("artifacts"), tabs: z.array(AgentArtifactSchema) }),
  z.object({ kind: z.literal("unknown"), text: z.string() })
]);

export type AgentArtifact = z.infer<typeof AgentArtifactSchema>;
export type AgentRunsDashboardData = z.infer<typeof AgentRunsDashboardDataSchema>;
export type AgentRunsDashboardUi = z.infer<typeof AgentRunsDashboardUiSchema>;
export type AgentJsonRenderUiPatch = z.infer<typeof AgentJsonRenderUiPatchSchema>;
export type AgentRunUi = z.infer<typeof AgentRunUiSchema>;
export type AgentRunEvent = z.infer<typeof AgentRunEventSchema>;
