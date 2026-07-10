import { describe, expect, it } from "vitest";
import {
  McpToolboxTimeWindowSchema,
  McpToolboxTimeWindowWithLimitSchema,
} from "./mcp-toolbox";

describe("MCP Toolbox input schemas", () => {
  it("accepts a bounded ISO-8601 UTC window", () => {
    expect(
      McpToolboxTimeWindowWithLimitSchema.parse({
        from: "2026-07-01T00:00:00Z",
        to: "2026-07-02T00:00:00Z",
        limit: 50,
      }),
    ).toMatchObject({ limit: 50 });
  });

  it("rejects inverted and oversized time windows", () => {
    expect(() =>
      McpToolboxTimeWindowSchema.parse({
        from: "2026-07-02T00:00:00Z",
        to: "2026-07-01T00:00:00Z",
      }),
    ).toThrow(/later than from/);
    expect(() =>
      McpToolboxTimeWindowSchema.parse({
        from: "2026-07-01T00:00:00Z",
        to: "2026-08-02T00:00:01Z",
      }),
    ).toThrow(/must not exceed 31 days/);
  });
});
