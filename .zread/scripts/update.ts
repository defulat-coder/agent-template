// Runs the project-local ZRead CLI from an isolated clone and HOME.
import { execFile as execFileCallback, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { composeProjectZReadConfig } from "./config.js";
import {
  assertAllowedZReadChanges,
  createZReadChildEnvironment,
} from "./policy.js";
import { publishDirectoryAtomically } from "./publication.js";
import { stageNativeZReadWiki } from "./wiki.js";
import { runZReadCliGeneration } from "./zread-cli.js";

const execFile = promisify(execFileCallback);
const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const zread = path.join(
  repositoryRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "zread.cmd" : "zread",
);
const expectedZReadVersion = readInstalledZReadVersion();

export async function updateZReadWiki(): Promise<void> {
  const temporaryRoot = await mkdtemp(
    path.join(tmpdir(), "agent-template-zread-"),
  );
  const isolatedHome = path.join(temporaryRoot, "home");
  const isolatedRepository = path.join(temporaryRoot, "repository");
  const stagedWiki = path.join(temporaryRoot, "published-wiki");

  try {
    await mkdir(path.join(isolatedHome, ".zread"), {
      mode: 0o700,
      recursive: true,
    });
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

    const projectConfig = await composeProjectZReadConfig(
      path.join(isolatedRepository, ".zread", "config"),
      process.env,
    );
    await writeFile(
      path.join(isolatedHome, ".zread", "config.yaml"),
      projectConfig.yaml,
      { encoding: "utf8", mode: 0o600 },
    );

    const childEnvironment = createZReadChildEnvironment(
      process.env,
      isolatedHome,
    );
    await runZReadCliGeneration({
      assertSafeText: projectConfig.assertSafeText,
      binary: zread,
      cwd: isolatedRepository,
      environment: childEnvironment,
      expectedVersion: expectedZReadVersion,
    });
    await assertZReadLogIsSafe(isolatedHome, projectConfig.assertSafeText);

    const changedPaths = await collectChangedPaths(isolatedRepository);
    assertAllowedZReadChanges(changedPaths);

    const snapshot = await stageNativeZReadWiki(
      path.join(isolatedRepository, ".zread", "wiki"),
      stagedWiki,
      projectConfig.assertSafeText,
    );
    await mkdir(path.join(repositoryRoot, ".zread"), { recursive: true });
    await publishDirectoryAtomically(
      stagedWiki,
      path.join(repositoryRoot, ".zread", "wiki"),
    );

    console.log(
      `Published ZRead wiki ${snapshot.id} with ${snapshot.pages.length} pages from an isolated clone using ${projectConfig.files.length} project config files.`,
    );
  } catch (error) {
    let failure: unknown = error;
    if (process.env.ZREAD_PRESERVE_FAILED_OUTPUT === "1") {
      try {
        const preservedWiki = await preserveFailedWiki(isolatedRepository);
        failure = new Error(
          `ZRead output validation failed; generated wiki preserved at ${preservedWiki}`,
          { cause: error },
        );
      } catch (preservationError) {
        failure = new AggregateError(
          [error, preservationError],
          "ZRead generation failed and its generated wiki could not be preserved",
        );
      }
    }
    try {
      await rm(temporaryRoot, { force: true, recursive: true });
    } catch (cleanupError) {
      throw new AggregateError(
        [failure, cleanupError],
        "ZRead generation failed and its temporary workspace could not be removed",
      );
    }
    throw failure;
  }

  await rm(temporaryRoot, { force: true, recursive: true });
}

async function assertZReadLogIsSafe(
  isolatedHome: string,
  assertSafeText: (content: string, label: string) => void,
): Promise<void> {
  try {
    const log = await readFile(
      path.join(isolatedHome, ".zread", "log", "zread.log"),
      "utf8",
    );
    assertSafeText(log, "ZRead log");
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return;
    }
    throw error;
  }
}

function readInstalledZReadVersion(): string {
  const packagePath = path.join(
    repositoryRoot,
    "node_modules",
    "zread_cli",
    "package.json",
  );
  let packageJson: unknown;
  try {
    packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
  } catch (error) {
    throw new Error(
      "Project-local zread_cli is not installed; run pnpm install",
      { cause: error },
    );
  }
  if (
    !packageJson ||
    typeof packageJson !== "object" ||
    !("name" in packageJson) ||
    packageJson.name !== "zread_cli" ||
    !("version" in packageJson) ||
    typeof packageJson.version !== "string"
  ) {
    throw new Error(
      `Invalid project-local zread_cli package at ${packagePath}`,
    );
  }
  return packageJson.version;
}

async function preserveFailedWiki(isolatedRepository: string): Promise<string> {
  const preservationRoot = await mkdtemp(
    path.join(tmpdir(), "agent-template-zread-failed-"),
  );
  const preservedWiki = path.join(preservationRoot, "wiki");
  await cp(path.join(isolatedRepository, ".zread", "wiki"), preservedWiki, {
    recursive: true,
  });
  return preservedWiki;
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
