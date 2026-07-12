import { globSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const dockerfile = readFileSync(join(repositoryRoot, "Dockerfile"), "utf8");
const installMarker = dockerfile.indexOf("pnpm install --frozen-lockfile");

if (installMarker === -1) {
  throw new Error("Dockerfile must install the frozen pnpm lockfile");
}

const workspace = parse(
  readFileSync(join(repositoryRoot, "pnpm-workspace.yaml"), "utf8"),
) as { packages?: unknown };
if (
  !Array.isArray(workspace.packages) ||
  workspace.packages.some((pattern) => typeof pattern !== "string")
) {
  throw new Error("pnpm-workspace.yaml must declare string package globs");
}

const workspaceManifests = workspace.packages
  .flatMap((pattern) =>
    globSync(`${pattern}/package.json`, { cwd: repositoryRoot }),
  )
  .sort();
const copiedBeforeInstall = readCopySources(dockerfile.slice(0, installMarker));
const missingManifests = workspaceManifests.filter(
  (manifest) => !copiedBeforeInstall.has(manifest),
);

if (missingManifests.length > 0) {
  throw new Error(
    `Dockerfile must copy every workspace manifest before pnpm install; missing: ${missingManifests.join(", ")}`,
  );
}

const broadWorkspaceCopies = [...copiedBeforeInstall].filter(
  (source) =>
    source === "." ||
    source === "apps" ||
    source === "packages" ||
    ((source.startsWith("apps/") || source.startsWith("packages/")) &&
      !source.endsWith("/package.json")),
);
if (broadWorkspaceCopies.length > 0) {
  throw new Error(
    `Dockerfile install layer must copy workspace manifests only, not source trees: ${broadWorkspaceCopies.join(", ")}`,
  );
}

const dockerignore = readFileSync(join(repositoryRoot, ".dockerignore"), "utf8")
  .split(/\r?\n/u)
  .map((line) => line.trim());
if (!dockerignore.includes("node_modules")) {
  throw new Error(".dockerignore must exclude node_modules");
}

console.log(
  `Docker workspace manifest closure is valid: ${workspaceManifests.length} package manifests copied before install.`,
);

function readCopySources(input: string) {
  const sources = new Set<string>();
  for (const line of input.split(/\r?\n/u)) {
    const tokens = line.trim().split(/\s+/u);
    if (tokens[0] !== "COPY" || tokens.length < 3) continue;
    const copyArguments = tokens
      .slice(1)
      .filter((token) => !token.startsWith("--"));
    for (const source of copyArguments.slice(0, -1)) sources.add(source);
  }
  return sources;
}
