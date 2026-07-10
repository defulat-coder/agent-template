import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));
const eveSkillsRoot = join(repositoryRoot, "packages/agent-eve/agent/skills");
const claudeSkillsRoot = join(repositoryRoot, ".claude/skills");

const skills = [
  {
    name: "ecommerce-sales-analysis",
    tools: [
      "summarize-ecommerce-sales-by-day",
      "summarize-ecommerce-sales-by-channel",
    ],
  },
  {
    name: "ecommerce-product-analysis",
    tools: ["list-ecommerce-top-products"],
  },
  {
    name: "ecommerce-order-operations",
    tools: ["list-ecommerce-orders-in-window", "get-ecommerce-order-detail"],
  },
  {
    name: "ecommerce-fulfillment-operations",
    tools: [
      "list-ecommerce-fulfillment-exceptions",
      "get-ecommerce-order-detail",
    ],
  },
];

describe("Toolbox business skills", () => {
  it.each(skills)("installs $name for Eve and Claude", ({ name, tools }) => {
    const eveSkill = readSkill(eveSkillsRoot, name);
    const claudeSkill = readSkill(claudeSkillsRoot, name);

    expect(eveSkill).toContain(`name: ${name}`);
    expect(claudeSkill).toContain(`name: ${name}`);
    expect(eveSkill).toContain("Host-managed typed tools");
    expect(claudeSkill).toContain("Host-managed typed tools");

    for (const tool of tools) {
      expect(eveSkill).toContain(tool.replaceAll("-", "_"));
      expect(eveSkill).not.toContain(tool);
      expect(claudeSkill).toContain(tool);
    }

    expect(existsSync(join(eveSkillsRoot, name, "scripts"))).toBe(false);
    expect(existsSync(join(claudeSkillsRoot, name, "scripts"))).toBe(false);
  });
});

function readSkill(root: string, name: string) {
  return readFileSync(join(root, name, "SKILL.md"), "utf8");
}
