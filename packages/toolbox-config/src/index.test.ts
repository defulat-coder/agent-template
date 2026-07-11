import { describe, expect, it } from "vitest";
import {
  parseToolboxAgentConfig,
  toolboxCapabilityProfiles,
  toolboxToolNames,
} from "./index.js";

describe("Toolbox Agent config", () => {
  it("stays disabled until a Toolbox URL is configured", () => {
    expect(parseToolboxAgentConfig({})).toBeUndefined();
  });

  it("does not append a second MCP path", () => {
    expect(
      parseToolboxAgentConfig({ TOOLBOX_URL: "http://localhost:15000/mcp" })
        ?.url,
    ).toBe("http://localhost:15000/mcp");
  });

  it("normalizes the MCP URL and resolves a deployment capability profile", () => {
    expect(
      parseToolboxAgentConfig({
        AGENT_CAPABILITY_PROFILE: "ecommerce-sales",
        TOOLBOX_AUTH_TOKEN: "service-token",
        TOOLBOX_URL: "http://toolbox:15000/",
      }),
    ).toEqual({
      allowedTools: [
        "summarize-ecommerce-sales-by-day",
        "summarize-ecommerce-sales-by-channel",
        "summarize_sales_by_region",
        "summarize_sales_by_customer_segment",
      ],
      authorizationToken: "service-token",
      capabilityProfile: "ecommerce-sales",
      url: "http://toolbox:15000/mcp",
    });
  });

  it("keeps every capability profile inside the declared Toolbox surface", () => {
    const knownTools = new Set(toolboxToolNames);
    for (const tools of Object.values(toolboxCapabilityProfiles)) {
      expect(tools.length).toBeGreaterThan(0);
      expect(tools.every((tool) => knownTools.has(tool))).toBe(true);
    }
  });

  it("rejects unknown deployment profiles", () => {
    expect(() =>
      parseToolboxAgentConfig({
        AGENT_CAPABILITY_PROFILE: "unknown",
        TOOLBOX_URL: "http://toolbox:15000",
      }),
    ).toThrow();
  });
});
