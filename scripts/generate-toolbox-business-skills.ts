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
  toolboxCapabilityProfiles,
  toolboxToolNames,
  type ToolboxToolName,
} from "@agent-template/toolbox-config";

type BusinessSkill = {
  description: string;
  name: string;
  toolset: string;
  workflow: string;
};

type GeneratedBusinessSkillMetadata = {
  name: string;
  tools: ToolboxToolName[];
};

const businessSkills: BusinessSkill[] = [
  {
    name: "ecommerce-sales-analysis",
    toolset: "ecommerce-sales-analytics",
    description:
      "分析电商销售额、退款、净销售额、买家数与渠道表现。用户询问销售趋势、GMV、退款、净销售额或渠道对比时使用。",
    workflow: `1. 要求或确认不超过 31 天的 UTC \`[from, to)\` 时间窗。
2. 先调用 \`summarize-ecommerce-sales-by-day\` 判断趋势和异常日期。
3. 需要渠道归因时，再调用 \`summarize-ecommerce-sales-by-channel\`。
4. 用户询问大区时调用 \`summarize_sales_by_region\`；询问新客、活跃、VIP 或流失风险人群时调用 \`summarize_sales_by_customer_segment\`。
5. 指标口径仅包含 \`PAID\`、\`FULFILLED\` 和 \`REFUNDED\` 订单；明确区分 \`grossSales\`、\`refundAmount\` 与 \`netSales\`。
6. 渠道、区域和分群 \`averageOrderValue\` 是平均单笔净销售额，不要把退款前销售额描述成实际收入。`,
  },
  {
    name: "ecommerce-product-analysis",
    toolset: "ecommerce-product-analytics",
    description:
      "按销量、商品销售总额和退款调整后的净商品销售额分析商品表现。用户询问商品排行、畅销商品、品类表现或选品分析时使用。",
    workflow: `1. 要求或确认不超过 31 天的 UTC \`[from, to)\` 时间窗，并设置有界 \`limit\`。
2. 调用 \`list-ecommerce-top-products\` 获取商品排行。
3. 用户询问品类时调用 \`summarize_merchandise_by_category\`，不把商品排行当作品类汇总。
4. 同时解释销量、毛商品销售额与退款分摊后的净商品销售额；这两个销售额都不包含运费。
5. 不从排行结果推断库存、利润或转化率；当前 Tool 没有这些字段。`,
  },
  {
    name: "ecommerce-order-operations",
    toolset: "ecommerce-order-operations",
    description:
      "通过有界订单列表和精确订单明细排查电商订单。用户询问订单状态、客户分群背景、具体订单号或订单级故障时使用。",
    workflow: `1. 用户提供订单号时，直接调用 \`get-ecommerce-order-detail\`，不要先扫描订单列表。
2. 用户询问一段时间的订单时，调用 \`list-ecommerce-orders-in-window\`，时间窗不超过 31 天且结果有界。
3. 需要继续核查时，只对用户选中的具体订单调用详情 Tool。
4. 返回合成 customer code、segment 和地区即可；不要声称存在联系方式或真实个人信息。`,
  },
  {
    name: "ecommerce-fulfillment-operations",
    toolset: "ecommerce-fulfillment-operations",
    description:
      "查找已付款但未履约的电商订单并支持履约异常排查。用户询问履约积压、等待时长、延迟订单或运营异常时使用。",
    workflow: `1. 要求或确认不超过 31 天的 UTC \`[from, to)\` 时间窗，并设置有界 \`limit\`。
2. 调用 \`list-ecommerce-fulfillment-exceptions\` 获取已支付未履约订单。
3. 将 \`to\` 解释为等待时长的参考时间，不要当作当前系统时间。
4. 需要订单项时，仅对具体异常订单调用 \`get-ecommerce-order-detail\`。`,
  },
];

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const claudePackageRoot = join(repositoryRoot, "packages/agent-claude");
const evePackageRoot = join(repositoryRoot, "packages/agent-eve");
const toolboxConfig = join(repositoryRoot, "apps/toolbox/tools.yaml");
const ecommerceSemanticCatalog = join(
  repositoryRoot,
  "apps/toolbox/semantic/ecommerce.yaml",
);
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
const outputRoots = {
  claude: join(claudePackageRoot, ".claude/skills"),
  eve: join(evePackageRoot, "agent/skills"),
};

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  try {
    for (const skill of businessSkills) {
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
        name: skill.name,
        tools: validatedToolNames.sort(),
      });
      const adaptedMarkdown = adaptSkillMarkdown(
        generatedMarkdown,
        skill.workflow,
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

      for (const [runtime, outputRoot] of Object.entries(outputRoots)) {
        const outputSkill = join(outputRoot, skill.name);
        const outputMarkdown = join(outputSkill, "SKILL.md");
        const outputSemanticCatalog = join(
          outputSkill,
          "references/ecommerce-semantic-catalog.yaml",
        );
        const markdown = await format(
          useRuntimeToolNames(adaptedMarkdown, toolNames, runtime),
          { parser: "markdown" },
        );

        if (checkOnly) {
          const expectedFiles = [
            "SKILL.md",
            "references/ecommerce-semantic-catalog.yaml",
          ];
          const outputFiles = existsSync(outputSkill)
            ? listRelativeFiles(outputSkill)
            : [];
          if (
            JSON.stringify(outputFiles) !== JSON.stringify(expectedFiles) ||
            !existsSync(outputMarkdown) ||
            readFileSync(outputMarkdown, "utf8") !== markdown ||
            !existsSync(outputSemanticCatalog) ||
            !readFileSync(outputSemanticCatalog).equals(
              readFileSync(ecommerceSemanticCatalog),
            )
          ) {
            staleOutputs.push(outputMarkdown);
          }
          continue;
        }

        rmSync(outputSkill, { force: true, recursive: true });
        mkdirSync(outputSkill, { recursive: true });
        writeFileSync(outputMarkdown, markdown, "utf8");
        mkdirSync(dirname(outputSemanticCatalog), { recursive: true });
        copyFileSync(ecommerceSemanticCatalog, outputSemanticCatalog);
      }
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

function adaptSkillMarkdown(markdown: string, workflow: string) {
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

涉及业务术语、指标、维度或枚举取值时，先读取 \`references/ecommerce-semantic-catalog.yaml\`。只使用其中认证的术语、口径和 Tool；遇到标记为 \`clarify\` 的术语，先向用户澄清，不要猜测或生成任意 SQL。
${toolReference}`;
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
        for (const outputRoot of [
          rawOutputRoot,
          ...Object.values(outputRoots),
        ]) {
          const obsoleteSkill = join(outputRoot, skillName);
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
      for (const outputRoot of [rawOutputRoot, ...Object.values(outputRoots)]) {
        rmSync(join(outputRoot, skillName), { force: true, recursive: true });
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
    Object.values(toolboxCapabilityProfiles).flat(),
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
    artifacts?: { discoveryManifest?: string };
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
  const missingSkills = businessSkills
    .map((skill) => skill.name)
    .filter((skillName) => !discoveredSkills.includes(skillName));

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
