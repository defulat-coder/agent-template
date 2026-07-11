import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { isScenarioName, supportsScenarioRoute } from "./scenarios.js";

const flowsDirectory = fileURLToPath(new URL("../flows", import.meta.url));
const planPath = fileURLToPath(new URL("../TEST_PLAN.md", import.meta.url));
const files = (await readdir(flowsDirectory))
  .filter((file) => file.endsWith(".md"))
  .sort();
const ids = new Set<string>();
const planRows = readPlanRows(await readFile(planPath, "utf8"));
const requiredFields = ["id", "priority", "route", "scenario", "mode"];
const requiredSections = ["前置条件", "操作", "预期", "证据"];

if (!files.length) throw new Error("No Web QA flow files found");

for (const file of files) {
  const content = await readFile(`${flowsDirectory}/${file}`, "utf8");
  const metadata = readFrontmatter(content);
  for (const field of requiredFields) {
    if (!metadata[field]) throw new Error(`${file}: missing ${field}`);
  }
  const id = metadata.id ?? "";
  if (ids.has(id)) throw new Error(`${file}: duplicate id ${id}`);
  ids.add(id);
  const planRow = planRows.get(id);
  if (!planRow) throw new Error(`${file}: missing TEST_PLAN row for ${id}`);
  if (
    planRow.priority !== metadata.priority ||
    planRow.scenario !== metadata.scenario ||
    planRow.flow !== `flows/${file}`
  ) {
    throw new Error(`${file}: TEST_PLAN row does not match flow metadata`);
  }
  if (!isScenarioName(metadata.scenario)) {
    throw new Error(`${file}: unknown scenario ${metadata.scenario}`);
  }
  if (!supportsScenarioRoute(metadata.scenario, metadata.route ?? "")) {
    throw new Error(
      `${file}: scenario ${metadata.scenario} does not support route ${metadata.route}`,
    );
  }
  for (const section of requiredSections) {
    if (!content.includes(`## ${section}`)) {
      throw new Error(`${file}: missing section ${section}`);
    }
  }
}

if (planRows.size !== files.length) {
  throw new Error(
    `TEST_PLAN has ${planRows.size} cases but flows has ${files.length}`,
  );
}

console.info(`Validated ${files.length} Web QA flows (${ids.size} unique IDs).`);

function readFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---\n/u);
  if (!match?.[1]) throw new Error("Flow is missing YAML frontmatter");
  return Object.fromEntries(
    match[1].split("\n").map((line) => {
      const separator = line.indexOf(":");
      if (separator < 1) throw new Error(`Invalid frontmatter line: ${line}`);
      return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
    }),
  );
}

function readPlanRows(content: string) {
  return new Map(
    content
      .split("\n")
      .filter((line) => line.startsWith("| WEB-QA-"))
      .map((line) => {
        const cells = line
          .split("|")
          .slice(1, -1)
          .map((cell) => cell.trim().replaceAll("`", ""));
        const [id, priority, , scenario, , flow] = cells;
        if (!id || !priority || !scenario || !flow) {
          throw new Error(`Invalid TEST_PLAN row: ${line}`);
        }
        return [id, { priority, scenario, flow }] as const;
      }),
  );
}
