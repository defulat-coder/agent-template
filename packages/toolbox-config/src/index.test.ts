import { describe, expect, it } from "vitest";
import {
  parseToolboxAgentConfig,
  resolveToolboxCapabilityProfile,
  toolboxBusinessCapabilityPacks,
  toolboxCapabilityProfilePacks,
  toolboxCapabilityProfiles,
  toolboxSkillNames,
  toolboxToolNames,
  toolboxToolScopes,
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

  it("normalizes a trailing slash after the MCP path", () => {
    expect(
      parseToolboxAgentConfig({ TOOLBOX_URL: "http://localhost:15000/mcp/" })
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
      enabledSkills: ["ecommerce-sales-analysis"],
      scopes: ["ecommerce:read"],
      url: "http://toolbox:15000/mcp",
    });
  });

  it("derives the complete Tool and Skill taxonomy from capability packs", () => {
    expect(toolboxBusinessCapabilityPacks.map((pack) => pack.name)).toEqual(
      toolboxSkillNames,
    );
    expect(new Set(toolboxToolNames).size).toBe(toolboxToolNames.length);

    for (const pack of toolboxBusinessCapabilityPacks) {
      expect(pack.tools.length).toBeGreaterThan(0);
      for (const tool of pack.tools) {
        expect(toolboxToolScopes[tool]).toBe(pack.scope);
      }
    }
  });

  it("keeps every capability profile inside the declared Toolbox surface", () => {
    const knownTools = new Set(toolboxToolNames);
    for (const tools of Object.values(toolboxCapabilityProfiles)) {
      expect(tools.length).toBeGreaterThan(0);
      expect(tools.every((tool) => knownTools.has(tool))).toBe(true);
    }
  });

  it("classifies every Toolbox tool into one explicit production scope", () => {
    expect(Object.keys(toolboxToolScopes).sort()).toEqual(
      [...toolboxToolNames].sort(),
    );
    expect(toolboxToolScopes["list-agent-runs"]).toBe("agent-template:observe");
    expect(toolboxToolScopes["summarize-ecommerce-sales-by-day"]).toBe(
      "ecommerce:read",
    );
  });

  it("derives platform observability from the explicit production scope", () => {
    expect(toolboxCapabilityProfiles["platform-observability"]).toEqual(
      toolboxToolNames.filter(
        (toolName) => toolboxToolScopes[toolName] === "agent-template:observe",
      ),
    );
  });

  it.each([
    ["finance-controller", "finance-analysis", "finance:read"],
    ["logistics-operator", "logistics-operations", "logistics:read"],
    ["supply-chain-planner", "supply-chain-operations", "supply-chain:read"],
    ["growth-analyst", "marketing-analysis", "marketing:read"],
  ] as const)(
    "activates an atomic business pack for %s",
    (profile, skill, scope) => {
      const activation = resolveToolboxCapabilityProfile(profile);

      expect(activation.enabledSkills).toEqual([skill]);
      expect(activation.scopes).toEqual([scope]);
      expect(activation.tools).toEqual(toolboxCapabilityProfiles[profile]);
      expect(toolboxCapabilityProfilePacks[profile]).toHaveLength(1);
    },
  );

  it("composes the broad business profile from complete packs", () => {
    const activation = resolveToolboxCapabilityProfile("business-operations");

    expect(activation.enabledSkills).toEqual(toolboxSkillNames);
    expect(activation.scopes).toEqual([
      "ecommerce:read",
      "finance:read",
      "logistics:read",
      "supply-chain:read",
      "marketing:read",
    ]);
    expect(activation.tools).not.toContain("list-agent-runs");
  });

  it("rejects unknown deployment profiles", () => {
    expect(() =>
      parseToolboxAgentConfig({
        AGENT_CAPABILITY_PROFILE: "unknown",
        TOOLBOX_URL: "http://toolbox:15000",
      }),
    ).toThrow();
  });

  it("requires an explicit least-visibility profile for authenticated connections", () => {
    for (const profile of [
      undefined,
      "development-all",
      "business-operations",
    ]) {
      expect(() =>
        parseToolboxAgentConfig({
          AGENT_CAPABILITY_PROFILE: profile,
          TOOLBOX_AUTH_TOKEN: "service-token",
          TOOLBOX_URL: "https://toolbox.example.com",
        }),
      ).toThrow(
        /authenticated Toolbox connections require an explicit production role profile/,
      );
    }
  });
});
