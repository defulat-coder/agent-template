import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "prettier";
import {
  toolboxBusinessCapabilityPacks,
  toolboxToolNames,
  type ToolboxBusinessCapabilityPackDefinition,
  type ToolboxToolName,
} from "@agent-template/toolbox-config";

type BusinessSkill = ToolboxBusinessCapabilityPackDefinition;

type GeneratedBusinessSkillMetadata = {
  catalog: string;
  name: string;
  scope: BusinessSkill["scope"];
  tools: ToolboxToolName[];
  toolset: string;
};

const businessSkills: readonly BusinessSkill[] = toolboxBusinessCapabilityPacks;

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const claudePackageRoot = join(repositoryRoot, "packages/agent-claude");
const evePackageRoot = join(repositoryRoot, "packages/agent-eve");
const toolboxConfig = join(repositoryRoot, "apps/toolbox/tools.yaml");
const semanticCatalogRoot = join(repositoryRoot, "apps/toolbox/semantic");
const toolboxExecutable = join(
  repositoryRoot,
  "node_modules/.bin",
  process.platform === "win32" ? "toolbox.cmd" : "toolbox",
);
const eveExecutable = join(
  evePackageRoot,
  "node_modules/.bin",
  process.platform === "win32" ? "eve.cmd" : "eve",
);
const generatedRoot = mkdtempSync(join(tmpdir(), "toolbox-business-skills-"));
const rawOutputRoot = join(repositoryRoot, "generated/toolbox-skills");
const manifestPath = join(rawOutputRoot, "manifest.json");
const claudeManifestPath = join(
  claudePackageRoot,
  ".claude/skills-manifest.json",
);
const checkOnly = process.argv.includes("--check");
const staleOutputs: string[] = [];
const generatedBusinessSkillMetadata: GeneratedBusinessSkillMetadata[] = [];
const claudeSkillsRoot = join(claudePackageRoot, ".claude/skills");
const eveSkillsRoot = join(evePackageRoot, "agent/skills");
const eveSemanticCatalogsModule = join(
  evePackageRoot,
  "agent/lib/business-semantic-catalogs.ts",
);
const compatibilityEveSemanticCatalogModule = join(
  evePackageRoot,
  "agent/lib/ecommerce-semantic-catalog.ts",
);

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  try {
    const eveSemanticCatalogSource = await renderEveSemanticCatalogsModule();
    const compatibilityEveSemanticCatalogSource =
      await renderCompatibilityEveSemanticCatalogModule();
    if (checkOnly) {
      if (
        !existsSync(eveSemanticCatalogsModule) ||
        readFileSync(eveSemanticCatalogsModule, "utf8") !==
          eveSemanticCatalogSource
      ) {
        staleOutputs.push(eveSemanticCatalogsModule);
      }
      if (
        !existsSync(compatibilityEveSemanticCatalogModule) ||
        readFileSync(compatibilityEveSemanticCatalogModule, "utf8") !==
          compatibilityEveSemanticCatalogSource
      ) {
        staleOutputs.push(compatibilityEveSemanticCatalogModule);
      }
    } else {
      mkdirSync(dirname(eveSemanticCatalogsModule), { recursive: true });
      writeFileSync(
        eveSemanticCatalogsModule,
        eveSemanticCatalogSource,
        "utf8",
      );
      writeFileSync(
        compatibilityEveSemanticCatalogModule,
        compatibilityEveSemanticCatalogSource,
        "utf8",
      );
    }

    for (const skill of businessSkills) {
      const semanticCatalog = join(semanticCatalogRoot, skill.catalog);
      if (!existsSync(semanticCatalog)) {
        throw new Error(
          `${skill.name} semantic catalog does not exist: ${semanticCatalog}`,
        );
      }
      execFileSync(
        toolboxExecutable,
        [
          "--config",
          toolboxConfig,
          "skills-generate",
          "--name",
          skill.name,
          "--toolset",
          skill.toolset,
          "--description",
          skill.description,
          "--additional-notes",
          skill.workflow,
          "--output-dir",
          generatedRoot,
          "--invocation-mode",
          "npx",
          "--toolbox-version",
          "1.6.0",
        ],
        { cwd: repositoryRoot, stdio: "inherit" },
      );

      const generatedMarkdown = readFileSync(
        join(generatedRoot, skill.name, "SKILL.md"),
        "utf8",
      );
      const generatedSkill = join(generatedRoot, skill.name);
      const rawOutputSkill = join(rawOutputRoot, skill.name);
      const toolNames = readGeneratedToolNames(generatedMarkdown);
      validateChineseBusinessContent(skill, generatedMarkdown, toolNames);
      const validatedToolNames = validateExecutionSurfaces(
        skill.name,
        toolNames,
      );
      generatedBusinessSkillMetadata.push({
        catalog: skill.catalog,
        name: skill.name,
        scope: skill.scope,
        tools: validatedToolNames.sort(),
        toolset: skill.toolset,
      });
      const adaptedMarkdown = adaptSkillMarkdown(
        generatedMarkdown,
        skill.workflow,
        skill.catalog,
      );

      if (checkOnly) {
        if (!directoriesMatch(generatedSkill, rawOutputSkill)) {
          staleOutputs.push(rawOutputSkill);
        }
      } else {
        rmSync(rawOutputSkill, { force: true, recursive: true });
        mkdirSync(rawOutputRoot, { recursive: true });
        cpSync(generatedSkill, rawOutputSkill, { recursive: true });
      }

      const claudeSkill = join(claudeSkillsRoot, skill.name);
      const claudeMarkdown = join(claudeSkill, "SKILL.md");
      const claudeSemanticCatalog = join(
        claudeSkill,
        "references",
        skill.catalog,
      );
      const formattedClaudeMarkdown = await format(
        useRuntimeToolNames(adaptedMarkdown, toolNames, "claude"),
        { parser: "markdown" },
      );
      const eveSkill = join(eveSkillsRoot, `${skill.name}.ts`);
      const formattedEveMarkdown = await format(
        useRuntimeToolNames(adaptedMarkdown, toolNames, "eve"),
        { parser: "markdown" },
      );
      const eveSource = await renderEveDynamicSkill(
        skill,
        formattedEveMarkdown,
      );

      if (checkOnly) {
        const expectedClaudeFiles = ["SKILL.md", `references/${skill.catalog}`];
        const claudeFiles = existsSync(claudeSkill)
          ? listRelativeFiles(claudeSkill)
          : [];
        if (
          JSON.stringify(claudeFiles) !== JSON.stringify(expectedClaudeFiles) ||
          !existsSync(claudeMarkdown) ||
          readFileSync(claudeMarkdown, "utf8") !== formattedClaudeMarkdown ||
          !existsSync(claudeSemanticCatalog) ||
          !readFileSync(claudeSemanticCatalog).equals(
            readFileSync(semanticCatalog),
          )
        ) {
          staleOutputs.push(claudeMarkdown);
        }
        if (
          existsSync(join(eveSkillsRoot, skill.name)) ||
          !existsSync(eveSkill) ||
          readFileSync(eveSkill, "utf8") !== eveSource
        ) {
          staleOutputs.push(eveSkill);
        }
        continue;
      }

      rmSync(claudeSkill, { force: true, recursive: true });
      mkdirSync(claudeSkill, { recursive: true });
      writeFileSync(claudeMarkdown, formattedClaudeMarkdown, "utf8");
      mkdirSync(dirname(claudeSemanticCatalog), { recursive: true });
      copyFileSync(semanticCatalog, claudeSemanticCatalog);

      rmSync(join(eveSkillsRoot, skill.name), { force: true, recursive: true });
      mkdirSync(eveSkillsRoot, { recursive: true });
      writeFileSync(eveSkill, eveSource, "utf8");
    }

    synchronizeManagedOutputs();
    synchronizeRawOutputRoot();

    if (staleOutputs.length > 0) {
      throw new Error(
        `Toolbox business skills are stale:\n${staleOutputs.join("\n")}`,
      );
    }

    validateClaudeDiscovery();
    validateEveDiscovery();
    console.log(
      checkOnly
        ? "Toolbox business skills are current and discoverable."
        : "Toolbox business skills generated and discovered successfully.",
    );
  } finally {
    rmSync(generatedRoot, { force: true, recursive: true });
  }
}

function adaptSkillMarkdown(
  markdown: string,
  workflow: string,
  semanticCatalog: string,
) {
  const usageHeading = "\n## Usage\n";
  const scriptsHeading = "\n## Scripts\n";
  const usageIndex = markdown.indexOf(usageHeading);
  const scriptsIndex = markdown.indexOf(scriptsHeading);

  if (usageIndex < 0 || scriptsIndex < 0 || scriptsIndex <= usageIndex) {
    throw new Error("Unexpected Toolbox-generated SKILL.md structure");
  }

  const frontmatter = markdown.slice(0, usageIndex).trimEnd();
  const toolReference = markdown
    .slice(scriptsIndex)
    .replace("## Scripts", "## Available Toolbox tools")
    .replace(/\n{3,}/g, "\n\n");

  return `${frontmatter}

## Usage

本项目的 Claude 与 Eve runtime 已分别通过原生 MCP Client 直连 Toolbox。加载本 Skill 后，调用当前 runtime 对应的 Toolbox MCP Tool；不要绕过 Toolbox 执行任意 SQL。官方生成器产出的数据库直连脚本不会安装到 Agent 的 Skill 目录。

## Workflow

${workflow}

## Business semantic catalog

涉及业务术语、指标、维度或枚举取值时，先读取 \`references/${semanticCatalog}\`。只使用其中认证的术语、口径和 Tool；遇到标记为 \`clarify\` 的术语，先向用户澄清，不要猜测或生成任意 SQL。
${toolReference}`;
}

async function renderEveDynamicSkill(skill: BusinessSkill, markdown: string) {
  const body = markdown.replace(/^---\n[\s\S]*?\n---\n+/u, "");

  return format(
    `import { defineDynamic, defineSkill } from "eve/skills";
import { hasToolboxSkill } from "../lib/capability-profile";
import { businessSemanticCatalogs } from "../lib/business-semantic-catalogs";

const skill = defineSkill(${JSON.stringify(
      {
        description: skill.description,
        markdown: body,
        files: {
          [`references/${skill.catalog}`]: "__BUSINESS_SEMANTIC_CATALOG__",
        },
      },
      null,
      2,
    ).replace(
      '"__BUSINESS_SEMANTIC_CATALOG__"',
      `businessSemanticCatalogs[${JSON.stringify(skill.catalog)}]`,
    )});

export default defineDynamic({
  events: {
    "session.started": () =>
      hasToolboxSkill(${JSON.stringify(skill.name)}) ? skill : null,
  },
});
`,
    { parser: "typescript" },
  );
}

async function renderEveSemanticCatalogsModule() {
  const catalogs = Object.fromEntries(
    Array.from(new Set(businessSkills.map((skill) => skill.catalog)))
      .sort()
      .map((catalog) => [
        catalog,
        readFileSync(join(semanticCatalogRoot, catalog), "utf8"),
      ]),
  );
  return format(
    `export const businessSemanticCatalogs = ${JSON.stringify(catalogs, null, 2)} as const;\n`,
    { parser: "typescript" },
  );
}

async function renderCompatibilityEveSemanticCatalogModule() {
  return format(
    `import { businessSemanticCatalogs } from "./business-semantic-catalogs";

// Preserve the former single-domain export for downstream imports and durable
// source links stored in committed ZRead snapshots.
export const ecommerceSemanticCatalog =
  businessSemanticCatalogs["ecommerce.yaml"];
`,
    { parser: "typescript" },
  );
}

function directoriesMatch(expectedRoot: string, actualRoot: string) {
  if (!existsSync(actualRoot)) {
    return false;
  }

  const expectedFiles = listRelativeFiles(expectedRoot);
  const actualFiles = listRelativeFiles(actualRoot);

  return (
    JSON.stringify(expectedFiles) === JSON.stringify(actualFiles) &&
    expectedFiles.every((file) =>
      readFileSync(join(expectedRoot, file)).equals(
        readFileSync(join(actualRoot, file)),
      ),
    )
  );
}

function listRelativeFiles(root: string, directory = root): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);

      if (entry.isDirectory()) {
        return listRelativeFiles(root, path);
      }

      return [path.slice(root.length + 1)];
    })
    .sort();
}

function synchronizeManagedOutputs() {
  const currentSkills = businessSkills.map((skill) => skill.name).sort();
  const previousSkills = readManagedSkillManifest();
  const manifest = `${JSON.stringify(
    {
      generatedBy: "scripts/generate-toolbox-business-skills.ts",
      skills: generatedBusinessSkillMetadata,
    },
    null,
    2,
  )}\n`;

  if (checkOnly) {
    if (
      !existsSync(manifestPath) ||
      readFileSync(manifestPath, "utf8") !== manifest ||
      !existsSync(claudeManifestPath) ||
      readFileSync(claudeManifestPath, "utf8") !== manifest
    ) {
      staleOutputs.push(manifestPath);
    }

    for (const skillName of previousSkills) {
      if (!currentSkills.includes(skillName)) {
        for (const obsoleteSkill of [
          join(rawOutputRoot, skillName),
          join(claudeSkillsRoot, skillName),
          join(eveSkillsRoot, skillName),
          join(eveSkillsRoot, `${skillName}.ts`),
        ]) {
          if (existsSync(obsoleteSkill)) {
            staleOutputs.push(obsoleteSkill);
          }
        }
      }
    }
    return;
  }

  for (const skillName of previousSkills) {
    if (!currentSkills.includes(skillName)) {
      for (const obsoleteSkill of [
        join(rawOutputRoot, skillName),
        join(claudeSkillsRoot, skillName),
        join(eveSkillsRoot, skillName),
        join(eveSkillsRoot, `${skillName}.ts`),
      ]) {
        rmSync(obsoleteSkill, { force: true, recursive: true });
      }
    }
  }

  mkdirSync(rawOutputRoot, { recursive: true });
  writeFileSync(manifestPath, manifest, "utf8");
  mkdirSync(dirname(claudeManifestPath), { recursive: true });
  writeFileSync(claudeManifestPath, manifest, "utf8");
}

function readManagedSkillManifest() {
  if (!existsSync(manifestPath)) {
    return [];
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    skills?: unknown;
  };

  if (!Array.isArray(manifest.skills)) {
    throw new Error("Toolbox business skill manifest must contain skills[]");
  }
  return manifest.skills.map((skill) => {
    if (typeof skill === "string") return skill;
    if (
      skill &&
      typeof skill === "object" &&
      "name" in skill &&
      typeof skill.name === "string"
    ) {
      return skill.name;
    }
    throw new Error("Toolbox business skill manifest has an invalid skill");
  });
}

function synchronizeRawOutputRoot() {
  const expectedDirectories = businessSkills.map((skill) => skill.name).sort();
  const actualDirectories = existsSync(rawOutputRoot)
    ? readdirSync(rawOutputRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort()
    : [];

  if (checkOnly) {
    if (
      JSON.stringify(actualDirectories) !== JSON.stringify(expectedDirectories)
    ) {
      staleOutputs.push(rawOutputRoot);
    }
    return;
  }

  for (const directory of actualDirectories) {
    if (!expectedDirectories.includes(directory)) {
      rmSync(join(rawOutputRoot, directory), { force: true, recursive: true });
    }
  }
}

function readGeneratedToolNames(markdown: string) {
  const toolNames = Array.from(
    markdown.matchAll(/^### ([a-z0-9_-]+)$/gm),
    (match) => match[1],
  ).filter((name): name is string => Boolean(name));

  if (toolNames.length === 0) {
    throw new Error("Toolbox-generated SKILL.md does not declare any tools");
  }

  return toolNames;
}

function validateChineseBusinessContent(
  skill: BusinessSkill,
  markdown: string,
  toolNames: string[],
) {
  const description = markdown.match(/^description: (.+)$/m)?.[1];

  if (!description || !containsChinese(description)) {
    throw new Error(`${skill.name} description must contain Chinese content`);
  }

  if (!markdown.includes(skill.workflow)) {
    throw new Error(`${skill.name} must include its Chinese workflow`);
  }

  for (const toolName of toolNames) {
    const toolStart = markdown.indexOf(`### ${toolName}`);

    if (toolStart < 0) {
      throw new Error(`${skill.name} does not document tool ${toolName}`);
    }

    const toolEnd = markdown.indexOf("\n---", toolStart);
    const toolSection = markdown.slice(
      toolStart,
      toolEnd < 0 ? undefined : toolEnd,
    );
    const parametersStart = toolSection.indexOf("#### Parameters");
    const toolDescription = toolSection.slice(
      `### ${toolName}`.length,
      parametersStart < 0 ? undefined : parametersStart,
    );

    if (!containsChinese(toolDescription)) {
      throw new Error(
        `${skill.name} tool ${toolName} must have a Chinese description`,
      );
    }

    for (const parameter of readParameterDescriptions(toolSection)) {
      if (!containsChinese(parameter.description)) {
        throw new Error(
          `${skill.name} tool ${toolName} parameter ${parameter.name} must have a Chinese description`,
        );
      }
    }
  }
}

function readParameterDescriptions(toolSection: string) {
  return toolSection
    .split("\n")
    .filter((line) => line.startsWith("|"))
    .map((line) =>
      line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim()),
    )
    .filter(
      (cells) =>
        cells.length >= 3 && cells[0] !== "Name" && !cells[0]?.startsWith(":"),
    )
    .map((cells) => ({
      description: cells[2] ?? "",
      name: cells[0] ?? "",
    }));
}

function containsChinese(value: string) {
  return /[\u3400-\u9fff]/u.test(value);
}

function validateExecutionSurfaces(skillName: string, toolNames: string[]) {
  const knownTools = new Set(toolboxToolNames);
  const profiledTools = new Set(
    toolboxBusinessCapabilityPacks.flatMap((pack) => pack.tools),
  );
  const eveConnection = readFileSync(
    join(evePackageRoot, "agent/connections/toolbox.ts"),
    "utf8",
  );

  for (const toolName of toolNames) {
    if (!knownTools.has(toolName as (typeof toolboxToolNames)[number])) {
      throw new Error(
        `${skillName} tool ${toolName} is missing from shared Toolbox config`,
      );
    }
    if (!profiledTools.has(toolName as (typeof toolboxToolNames)[number])) {
      throw new Error(
        `${skillName} tool ${toolName} has no capability profile`,
      );
    }
  }

  if (
    !eveConnection.includes("defineMcpClientConnection") ||
    !eveConnection.includes("tools: { allow: toolbox.allowedTools }")
  ) {
    throw new Error(
      "Eve Toolbox connection must apply the shared capability profile",
    );
  }

  return toolNames as ToolboxToolName[];
}

function validateClaudeDiscovery() {
  const manifest = JSON.parse(readFileSync(claudeManifestPath, "utf8")) as {
    skills?: Array<{ name?: string }>;
  };
  const discoveredSkills = manifest.skills?.map((skill) => skill.name) ?? [];
  const missingSkills = businessSkills
    .map((skill) => skill.name)
    .filter(
      (skillName) =>
        !discoveredSkills.includes(skillName) ||
        !existsSync(
          join(claudePackageRoot, ".claude/skills", skillName, "SKILL.md"),
        ),
    );

  if (missingSkills.length > 0) {
    throw new Error(
      `Claude did not discover all Toolbox business skills: ${missingSkills.join(", ")}`,
    );
  }
}

function validateEveDiscovery() {
  const output = execFileSync(eveExecutable, ["info", "--json"], {
    cwd: evePackageRoot,
    encoding: "utf8",
  });
  const jsonStart = output.indexOf("{");
  const info = JSON.parse(output.slice(jsonStart)) as {
    artifacts?: { compiledManifest?: string; discoveryManifest?: string };
    diagnostics?: { errors?: number };
    skills?: unknown;
  };
  const discoveredSkills = Array.isArray(info.skills) ? info.skills : [];
  const discovery = info.artifacts?.discoveryManifest
    ? (JSON.parse(readFileSync(info.artifacts.discoveryManifest, "utf8")) as {
        connections?: Array<{ connectionName?: string }>;
      })
    : undefined;
  const discoveredConnections =
    discovery?.connections?.map((connection) => connection.connectionName) ??
    [];
  const compiled = info.artifacts?.compiledManifest
    ? (JSON.parse(readFileSync(info.artifacts.compiledManifest, "utf8")) as {
        dynamicSkills?: Array<{ slug?: string }>;
      })
    : undefined;
  const dynamicSkills =
    compiled?.dynamicSkills?.map((skill) => skill.slug) ?? [];
  const missingSkills = businessSkills
    .map((skill) => skill.name)
    .filter(
      (skillName) =>
        !discoveredSkills.includes(skillName) &&
        !dynamicSkills.includes(skillName),
    );

  if (
    info.diagnostics?.errors !== 0 ||
    missingSkills.length > 0 ||
    !discoveredConnections.includes("toolbox")
  ) {
    throw new Error(
      `Eve did not discover all Toolbox business skills: ${missingSkills.join(", ")}`,
    );
  }
}

function useRuntimeToolNames(
  markdown: string,
  toolNames: string[],
  runtime: string,
) {
  return toolNames.reduce((content, toolName) => {
    const qualifiedName =
      runtime === "eve" ? `toolbox__${toolName}` : `mcp__toolbox__${toolName}`;
    return content
      .replaceAll(toolName, qualifiedName)
      .replace(`### ${qualifiedName}`, `### \`${qualifiedName}\``);
  }, markdown);
}
