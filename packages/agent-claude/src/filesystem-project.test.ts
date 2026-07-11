import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { toolboxCapabilityProfiles } from "@agent-template/toolbox-config";
import { resolveClaudeFilesystemProject } from "./filesystem-project.js";

const claudeProjectRoot = dirname(
  fileURLToPath(new URL("../package.json", import.meta.url)),
);
const repositoryRoot = resolve(claudeProjectRoot, "../..");
const temporaryDirectories: string[] = [];

describe("Claude filesystem project", () => {
  afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  it.each([
    ["source module", join(claudeProjectRoot, "src")],
    ["API bundle", join(repositoryRoot, "apps/api/dist")],
    ["Worker bundle", join(repositoryRoot, "apps/worker/dist")],
  ])("locates the package-owned project from a %s", (_, startDirectory) => {
    expect(
      resolveClaudeFilesystemProject({ startDirectories: [startDirectory] }),
    ).toEqual({ cwd: claudeProjectRoot, skills: [] });
  });

  it.each([
    [
      "development-all",
      [
        "ecommerce-sales-analysis",
        "ecommerce-product-analysis",
        "ecommerce-order-operations",
        "ecommerce-fulfillment-operations",
      ],
    ],
    ["platform-observability", []],
    [
      "ecommerce-analyst",
      [
        "ecommerce-sales-analysis",
        "ecommerce-product-analysis",
        "ecommerce-order-operations",
      ],
    ],
    ["ecommerce-sales", ["ecommerce-sales-analysis"]],
    ["ecommerce-product", ["ecommerce-product-analysis"]],
    ["ecommerce-orders", ["ecommerce-order-operations"]],
    [
      "ecommerce-fulfillment",
      ["ecommerce-order-operations", "ecommerce-fulfillment-operations"],
    ],
  ] as const)(
    "derives Skills for the %s capability profile",
    (profile, skills) => {
      expect(
        resolveClaudeFilesystemProject({
          allowedTools: toolboxCapabilityProfiles[profile],
          startDirectories: [claudeProjectRoot],
        }).skills,
      ).toEqual(skills);
    },
  );

  it("validates an explicitly deployed authored surface and its enabled Skills", () => {
    const projectDir = createClaudeProjectFixture(["ecommerce-sales-analysis"]);

    expect(
      resolveClaudeFilesystemProject({
        allowedTools: toolboxCapabilityProfiles["ecommerce-sales"],
        projectDir,
      }),
    ).toEqual({
      cwd: projectDir,
      skills: ["ecommerce-sales-analysis"],
    });
  });

  it("rejects a deployment missing a Skill required by its capability profile", () => {
    const projectDir = createClaudeProjectFixture([]);

    expect(() =>
      resolveClaudeFilesystemProject({
        allowedTools: toolboxCapabilityProfiles["ecommerce-sales"],
        projectDir,
      }),
    ).toThrow(
      "Claude project is missing authored surface: .claude/skills/ecommerce-sales-analysis/SKILL.md",
    );
  });
});

function createClaudeProjectFixture(skillNames: string[]) {
  const projectDir = mkdtempSync(join(tmpdir(), "agent-template-claude-"));
  temporaryDirectories.push(projectDir);
  mkdirSync(join(projectDir, ".claude"), { recursive: true });
  writeFileSync(
    join(projectDir, "package.json"),
    JSON.stringify({ name: "@agent-template/agent-claude" }),
  );
  writeFileSync(join(projectDir, ".claude/CLAUDE.md"), "# Runtime\n");
  writeFileSync(
    join(projectDir, ".claude/skills-manifest.json"),
    `${JSON.stringify(
      {
        skills: [
          {
            name: "ecommerce-sales-analysis",
            tools: [...toolboxCapabilityProfiles["ecommerce-sales"]],
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  for (const skillName of skillNames) {
    const skillDir = join(projectDir, ".claude/skills", skillName);
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), `# ${skillName}\n`);
  }
  return projectDir;
}
