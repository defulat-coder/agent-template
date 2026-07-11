import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  toolboxToolNames,
  type ToolboxToolName,
} from "@agent-template/toolbox-config";

export type ClaudeFilesystemProject = {
  cwd: string;
  skills: string[];
};

type ResolveClaudeFilesystemProjectOptions = {
  allowedTools?: readonly ToolboxToolName[] | undefined;
  projectDir?: string | undefined;
  startDirectories?: readonly string[];
};

export function resolveClaudeFilesystemProject({
  allowedTools,
  projectDir,
  startDirectories = defaultClaudeProjectStartDirectories(),
}: ResolveClaudeFilesystemProjectOptions = {}): ClaudeFilesystemProject {
  const cwd = projectDir
    ? resolve(projectDir)
    : findClaudeAgentProjectDir(startDirectories);
  validateClaudeAgentPackage(cwd);
  const skills = readEnabledSkills(cwd, allowedTools);
  validateClaudeAuthoredSurface(cwd, skills);
  return { cwd, skills };
}

function readEnabledSkills(
  directory: string,
  allowedTools: readonly ToolboxToolName[] | undefined,
) {
  const manifestPath = join(directory, ".claude/skills-manifest.json");
  let manifest: unknown;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    throw new Error(
      `Claude project has an invalid Skill manifest: ${manifestPath}`,
    );
  }

  if (!isClaudeSkillManifest(manifest)) {
    throw new Error(
      `Claude project has an invalid Skill manifest: ${manifestPath}`,
    );
  }

  if (!allowedTools) return [];

  const allowed = new Set(allowedTools);
  return manifest.skills
    .filter((skill) => skill.tools.every((tool) => allowed.has(tool)))
    .map((skill) => skill.name);
}

function isClaudeSkillManifest(
  value: unknown,
): value is { skills: Array<{ name: string; tools: ToolboxToolName[] }> } {
  if (!value || typeof value !== "object" || !("skills" in value)) {
    return false;
  }
  const knownTools = new Set<string>(toolboxToolNames);
  return (
    Array.isArray(value.skills) &&
    value.skills.every(
      (skill) =>
        skill &&
        typeof skill === "object" &&
        "name" in skill &&
        typeof skill.name === "string" &&
        "tools" in skill &&
        Array.isArray(skill.tools) &&
        skill.tools.length > 0 &&
        skill.tools.every(
          (tool: unknown): tool is ToolboxToolName =>
            typeof tool === "string" && knownTools.has(tool),
        ),
    )
  );
}

function defaultClaudeProjectStartDirectories() {
  return [
    dirname(fileURLToPath(import.meta.url)),
    process.cwd(),
    ...(process.env.INIT_CWD ? [process.env.INIT_CWD] : []),
  ];
}

function findClaudeAgentProjectDir(startDirectories: readonly string[]) {
  for (const startDirectory of startDirectories) {
    let directory = resolve(startDirectory);
    for (;;) {
      for (const candidate of [
        directory,
        join(directory, "packages/agent-claude"),
      ]) {
        if (isClaudeAgentPackage(candidate)) return candidate;
      }
      const parent = dirname(directory);
      if (parent === directory) break;
      directory = parent;
    }
  }

  throw new Error(
    "Agent Template Claude project was not found; set CLAUDE_PROJECT_DIR",
  );
}

function validateClaudeAgentPackage(directory: string) {
  if (!isClaudeAgentPackage(directory)) {
    throw new Error(
      `CLAUDE_PROJECT_DIR is not an Agent Template Claude project: ${directory}`,
    );
  }
}

function validateClaudeAuthoredSurface(directory: string, skills: string[]) {
  const missingArtifacts = [
    ".claude/CLAUDE.md",
    ...skills.map((skill) => `.claude/skills/${skill}/SKILL.md`),
  ].filter((artifact) => !existsSync(join(directory, artifact)));
  if (missingArtifacts.length > 0) {
    throw new Error(
      `Claude project is missing authored surface: ${missingArtifacts.join(", ")}`,
    );
  }
}

function isClaudeAgentPackage(directory: string) {
  try {
    const packageJson = JSON.parse(
      readFileSync(join(directory, "package.json"), "utf8"),
    ) as { name?: unknown };
    return packageJson.name === "@agent-template/agent-claude";
  } catch {
    return false;
  }
}
