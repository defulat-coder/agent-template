import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

type BusinessSkill = {
  description: string;
  name: string;
  tools: string[];
  toolset: string;
  workflow: string;
};

const businessSkills: BusinessSkill[] = [
  {
    name: "ecommerce-sales-analysis",
    toolset: "ecommerce_sales_analytics",
    description:
      "Analyzes ecommerce revenue, refunds, net sales, buyers, and channel performance. Use when the user asks about sales trends, GMV, refunds, net sales, or channel comparison.",
    tools: [
      "summarize-ecommerce-sales-by-day",
      "summarize-ecommerce-sales-by-channel",
    ],
    workflow: `1. 要求或确认不超过 31 天的 UTC \`[from, to)\` 时间窗。
2. 先调用 \`summarize-ecommerce-sales-by-day\` 判断趋势和异常日期。
3. 需要渠道归因时，再调用 \`summarize-ecommerce-sales-by-channel\`。
4. 明确区分 \`grossSales\`、\`refundAmount\` 与 \`netSales\`，不要把退款前销售额描述成实际收入。`,
  },
  {
    name: "ecommerce-product-analysis",
    toolset: "ecommerce_product_analytics",
    description:
      "Ranks ecommerce products by units, gross merchandise sales, and refund-adjusted net merchandise sales. Use when the user asks for product ranking, best sellers, category performance, or merchandising analysis.",
    tools: ["list-ecommerce-top-products"],
    workflow: `1. 要求或确认不超过 31 天的 UTC \`[from, to)\` 时间窗，并设置有界 \`limit\`。
2. 调用 \`list-ecommerce-top-products\` 获取商品排行。
3. 同时解释销量、毛商品销售额与退款分摊后的净商品销售额。
4. 不从排行结果推断库存、利润或转化率；当前 Tool 没有这些字段。`,
  },
  {
    name: "ecommerce-order-operations",
    toolset: "ecommerce_order_operations",
    description:
      "Investigates ecommerce orders using bounded operational lists and exact order details. Use when the user asks about order status, customer segment context, a concrete order number, or order-level troubleshooting.",
    tools: ["list-ecommerce-orders-in-window", "get-ecommerce-order-detail"],
    workflow: `1. 用户提供订单号时，直接调用 \`get-ecommerce-order-detail\`，不要先扫描订单列表。
2. 用户询问一段时间的订单时，调用 \`list-ecommerce-orders-in-window\`，时间窗不超过 31 天且结果有界。
3. 需要继续核查时，只对用户选中的具体订单调用详情 Tool。
4. 返回合成 customer code、segment 和地区即可；不要声称存在联系方式或真实个人信息。`,
  },
  {
    name: "ecommerce-fulfillment-operations",
    toolset: "ecommerce_fulfillment_operations",
    description:
      "Finds paid but unfulfilled ecommerce orders and supports fulfillment exception investigation. Use when the user asks about fulfillment backlog, waiting time, delayed orders, or operational exceptions.",
    tools: [
      "list-ecommerce-fulfillment-exceptions",
      "get-ecommerce-order-detail",
    ],
    workflow: `1. 要求或确认不超过 31 天的 UTC \`[from, to)\` 时间窗，并设置有界 \`limit\`。
2. 调用 \`list-ecommerce-fulfillment-exceptions\` 获取已支付未履约订单。
3. 将 \`to\` 解释为等待时长的参考时间，不要当作当前系统时间。
4. 需要订单项时，仅对具体异常订单调用 \`get-ecommerce-order-detail\`。`,
  },
];

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));
const toolboxConfig = join(repositoryRoot, "apps/toolbox/tools.yaml");
const toolboxExecutable = join(
  packageRoot,
  "node_modules/.bin",
  process.platform === "win32" ? "toolbox.cmd" : "toolbox",
);
const prettierExecutable = join(
  repositoryRoot,
  "node_modules/.bin",
  process.platform === "win32" ? "prettier.cmd" : "prettier",
);
const generatedRoot = mkdtempSync(join(tmpdir(), "toolbox-business-skills-"));
const installedSkillMarkdown: string[] = [];
const outputRoots = {
  claude: join(repositoryRoot, ".claude/skills"),
  eve: join(packageRoot, "agent/skills"),
};

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
        "--output-dir",
        generatedRoot,
        "--invocation-mode",
        "npx",
        "--toolbox-version",
        "1.6.0",
      ],
      { cwd: repositoryRoot, stdio: "inherit" },
    );

    const generatedSkill = join(generatedRoot, skill.name);
    const skillMarkdownPath = join(generatedSkill, "SKILL.md");
    const generatedMarkdown = readFileSync(skillMarkdownPath, "utf8");
    const adaptedMarkdown = adaptSkillMarkdown(
      generatedMarkdown,
      skill.workflow,
    );

    for (const [runtime, outputRoot] of Object.entries(outputRoots)) {
      mkdirSync(outputRoot, { recursive: true });
      const outputSkill = join(outputRoot, skill.name);
      rmSync(outputSkill, { force: true, recursive: true });
      mkdirSync(outputSkill, { recursive: true });
      const outputMarkdown = join(outputSkill, "SKILL.md");
      writeFileSync(
        outputMarkdown,
        runtime === "eve"
          ? useEveToolNames(adaptedMarkdown, skill.tools)
          : adaptedMarkdown,
        "utf8",
      );
      installedSkillMarkdown.push(outputMarkdown);
    }
  }

  execFileSync(prettierExecutable, ["--write", ...installedSkillMarkdown], {
    cwd: repositoryRoot,
    stdio: "inherit",
  });
} finally {
  rmSync(generatedRoot, { force: true, recursive: true });
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

本项目已经把下列 Toolbox 能力注册为 Host-managed typed tools。加载本 skill 后，直接调用同名 Tool；不要绕过 MCP Host 直连数据库。官方生成器同时产出的直连脚本不会安装到 Agent 的 skill 目录。

## Workflow

${workflow}
${toolReference}`;
}

function useEveToolNames(markdown: string, toolNames: string[]) {
  return toolNames.reduce(
    (content, toolName) =>
      content.replaceAll(toolName, toolName.replaceAll("-", "_")),
    markdown,
  );
}
