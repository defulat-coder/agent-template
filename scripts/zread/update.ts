import { execFile as execFileCallback, spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  assertAllowedZReadChanges,
  createZReadChildEnvironment,
  createZReadConfigYaml,
  parseZReadVersionOutput,
  resolveZReadProviderConfig,
  validateZReadEventStream,
} from "./policy.js";
import { publishDirectoryAtomically } from "./publication.js";
import { stageCurrentZReadWiki } from "./wiki.js";

const execFile = promisify(execFileCallback);
const expectedZReadVersion = "0.2.13";
const repositoryRoot = path.resolve(import.meta.dirname, "../..");

export async function updateZReadWiki(): Promise<void> {
  const provider = resolveZReadProviderConfig(process.env);
  const temporaryRoot = await mkdtemp(
    path.join(tmpdir(), "agent-template-zread-"),
  );
  const isolatedHome = path.join(temporaryRoot, "home");
  const isolatedRepository = path.join(temporaryRoot, "repository");
  const stagedWiki = path.join(temporaryRoot, "published-wiki");
  const zread = process.env.ZREAD_BIN?.trim() || "zread";

  try {
    await mkdir(path.join(isolatedHome, ".zread"), {
      mode: 0o700,
      recursive: true,
    });
    await writeFile(
      path.join(isolatedHome, ".zread", "config.yaml"),
      createZReadConfigYaml(provider),
      { encoding: "utf8", mode: 0o600 },
    );

    await runCommand(
      "git",
      [
        "clone",
        "--local",
        "--no-hardlinks",
        "--quiet",
        repositoryRoot,
        isolatedRepository,
      ],
      repositoryRoot,
    );

    const childEnvironment = createZReadChildEnvironment(
      process.env,
      isolatedHome,
    );
    const { stdout: versionOutput } = await execFile(
      zread,
      ["version", "--stdio"],
      {
        cwd: isolatedRepository,
        encoding: "utf8",
        env: childEnvironment,
      },
    );
    parseZReadVersionOutput(versionOutput, expectedZReadVersion);

    const generationLines = await runZReadGeneration(
      zread,
      isolatedRepository,
      childEnvironment,
    );
    validateZReadEventStream(generationLines);

    const changedPaths = await collectChangedPaths(isolatedRepository);
    assertAllowedZReadChanges(changedPaths);

    const snapshot = await stageCurrentZReadWiki(
      path.join(isolatedRepository, ".zread", "wiki"),
      stagedWiki,
    );
    await mkdir(path.join(repositoryRoot, ".zread"), { recursive: true });
    await publishDirectoryAtomically(
      stagedWiki,
      path.join(repositoryRoot, ".zread", "wiki"),
    );

    console.log(
      `Published ZRead wiki ${snapshot.id} with ${snapshot.pages.length} pages from an isolated clone.`,
    );
  } catch (error) {
    try {
      await rm(temporaryRoot, { force: true, recursive: true });
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "ZRead generation failed and its temporary workspace could not be removed",
      );
    }
    throw error;
  }

  await rm(temporaryRoot, { force: true, recursive: true });
}

async function runZReadGeneration(
  zread: string,
  cwd: string,
  environment: NodeJS.ProcessEnv,
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      zread,
      ["generate", "--draft", "clear", "--skip-failed", "--yes", "--stdio"],
      {
        cwd,
        env: environment,
        stdio: ["ignore", "pipe", "inherit"],
      },
    );
    const lines: string[] = [];
    let buffer = "";

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      buffer += chunk;
      const chunks = buffer.split("\n");
      buffer = chunks.pop() ?? "";
      lines.push(...chunks.filter((line) => line.trim().length > 0));
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (buffer.trim()) {
        lines.push(buffer);
      }
      if (code === 0) {
        resolve(lines);
        return;
      }
      reject(
        new Error(
          `ZRead generation failed with ${signal ? `signal ${signal}` : `exit code ${code}`}`,
        ),
      );
    });
  });
}

async function collectChangedPaths(
  isolatedRepository: string,
): Promise<string[]> {
  const [{ stdout: tracked }, { stdout: untracked }] = await Promise.all([
    execFile("git", ["diff", "--name-only", "-z", "--no-renames", "HEAD"], {
      cwd: isolatedRepository,
      encoding: "utf8",
    }),
    execFile("git", ["ls-files", "--others", "--exclude-standard", "-z"], {
      cwd: isolatedRepository,
      encoding: "utf8",
    }),
  ]);

  return [
    ...new Set([
      ...splitNullSeparated(tracked),
      ...splitNullSeparated(untracked),
    ]),
  ].sort();
}

function splitNullSeparated(value: string): string[] {
  return value.split("\0").filter(Boolean);
}

function runCommand(
  command: string,
  args: readonly string[],
  cwd: string,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: environment,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `${command} ${args.join(" ")} failed with ${signal ? `signal ${signal}` : `exit code ${code}`}`,
        ),
      );
    });
  });
}

updateZReadWiki().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
