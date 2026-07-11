import { describe, expect, it } from "vitest";
import type { AgentRunEvent } from "@agent-template/shared";
import { appendAgentEventHistory } from "./event-history";

describe("appendAgentEventHistory", () => {
  it("replaces consecutive cumulative text snapshots", () => {
    const first = appendAgentEventHistory([], { kind: "text", text: "Hel" });
    const second = appendAgentEventHistory(first, {
      kind: "text",
      text: "Hello",
    });

    expect(second).toEqual([{ kind: "text", text: "Hello" }]);
  });

  it("keeps browser event history bounded", () => {
    const events = Array.from({ length: 8 }, (_, index) => ({
      kind: "tool-call" as const,
      callId: `call-${index}`,
      toolName: "qa-tool",
      input: {},
    }));

    const result = events.reduce<AgentRunEvent[]>(
      (history, event) => appendAgentEventHistory(history, event, 4),
      [],
    );

    expect(result).toHaveLength(4);
    expect(result[0]).toMatchObject({ callId: "call-4" });
  });

  it("preserves the latest artifact outside the recent window", () => {
    const artifact = {
      kind: "artifacts" as const,
      tabs: [
        { id: "report", label: "报告", hint: "Markdown", content: "结果" },
      ],
    };
    const events: AgentRunEvent[] = [
      artifact,
      { kind: "tool-call", callId: "1", toolName: "one", input: {} },
      { kind: "tool-call", callId: "2", toolName: "two", input: {} },
      { kind: "tool-call", callId: "3", toolName: "three", input: {} },
    ];

    const result = appendAgentEventHistory(
      events,
      { kind: "done", result: "完成" },
      4,
    );

    expect(result).toHaveLength(4);
    expect(result[0]).toEqual(artifact);
    expect(result.at(-1)).toEqual({ kind: "done", result: "完成" });
  });
});
