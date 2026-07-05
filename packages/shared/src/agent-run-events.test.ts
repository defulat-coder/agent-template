import { describe, expect, it } from "vitest";
import { AgentRunEventSchema } from "./agent-run-events";

describe("AgentRunEventSchema", () => {
  it("accepts the shared Agent run event protocol", () => {
    expect(
      AgentRunEventSchema.parse({
        kind: "tool-call",
        tool: "search",
        input: "{\"q\":\"agentcn\"}"
      })
    ).toEqual({
      kind: "tool-call",
      tool: "search",
      input: "{\"q\":\"agentcn\"}"
    });
    expect(AgentRunEventSchema.parse({ kind: "tool-result", tool: "search" })).toEqual({
      kind: "tool-result",
      tool: "search"
    });
    expect(AgentRunEventSchema.parse({ kind: "text", text: "hello" })).toEqual({ kind: "text", text: "hello" });
    expect(
      AgentRunEventSchema.parse({
        kind: "ui",
        ui: {
          component: "agent-runs-dashboard",
          title: "Agent 运行分析",
          data: {
            metrics: {
              completedRuns: 1,
              failedRuns: 1,
              failureRate: 0.5,
              totalRuns: 2
            },
            runs: [
              {
                eventCount: 4,
                firstEventAt: "2026-07-04T11:30:00.000Z",
                lastEventAt: "2026-07-04T11:30:22.000Z",
                runId: "run_knowledge_001",
                terminalEvent: "agent.run.completed"
              }
            ]
          }
        }
      })
    ).toMatchObject({ kind: "ui" });
    expect(
      AgentRunEventSchema.parse({
        kind: "ui",
        ui: {
          component: "json-render",
          id: "agent-runs-report",
          patch: { op: "add", path: "/root", value: "report" },
          title: "Agent 运行分析"
        }
      })
    ).toMatchObject({ kind: "ui", ui: { component: "json-render" } });
    expect(AgentRunEventSchema.parse({ kind: "done", result: "ok" })).toEqual({ kind: "done", result: "ok" });
  });

  it("accepts error, artifact, and unknown events", () => {
    const artifacts = AgentRunEventSchema.parse({
      kind: "artifacts",
      tabs: [{ id: "summary", label: "Summary", hint: "md", content: "# Done" }]
    });

    expect(AgentRunEventSchema.parse({ kind: "error", message: "failed" })).toEqual({ kind: "error", message: "failed" });
    expect(artifacts).toEqual({
      kind: "artifacts",
      tabs: [{ id: "summary", label: "Summary", hint: "md", content: "# Done" }]
    });
    expect(AgentRunEventSchema.parse({ kind: "unknown", text: "raw event" })).toEqual({ kind: "unknown", text: "raw event" });
  });
});
