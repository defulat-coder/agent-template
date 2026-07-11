import { describe, expect, it } from "vitest";
import { hasToolboxCapabilities } from "../agent/lib/capability-profile.js";

describe("Eve dynamic Skill capability profile", () => {
  it("exposes a Skill only when every required Toolbox Tool is visible", () => {
    const requiredTools = [
      "summarize-ecommerce-sales-by-day",
      "summarize-ecommerce-sales-by-channel",
    ] as const;

    expect(
      hasToolboxCapabilities(requiredTools, {
        AGENT_CAPABILITY_PROFILE: "ecommerce-sales",
        TOOLBOX_URL: "http://toolbox:15000",
      }),
    ).toBe(true);
    expect(
      hasToolboxCapabilities(requiredTools, {
        AGENT_CAPABILITY_PROFILE: "ecommerce-product",
        TOOLBOX_URL: "http://toolbox:15000",
      }),
    ).toBe(false);
  });

  it("does not expose generated Skills without a Toolbox connection", () => {
    expect(
      hasToolboxCapabilities(["summarize-ecommerce-sales-by-day"], {
        NODE_ENV: "production",
      }),
    ).toBe(false);
  });
});
