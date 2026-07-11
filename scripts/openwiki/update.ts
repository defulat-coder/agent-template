import { execFile as execFileCallback, spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  assertAllowedOpenWikiChanges,
  createOpenWikiChildEnvironment,
  resolveOpenWikiProviderConfig,
  validateGeneratedWikiFiles,
} from "./policy.js";
import { publishDirectoryAtomically } from "./publication.js";

const execFile = promisify(execFileCallback);
const openWikiVersion = "0.1.1";
const repositoryRoot = path.resolve(import.meta.dirname, "../..");

export async function updateOpenWiki(): Promise<void> {
  const provider = resolveOpenWikiProviderConfig(process.env);
  const temporaryRoot = await mkdtemp(
    path.join(tmpdir(), "agent-template-openwiki-"),
  );
  const isolatedHome = path.join(temporaryRoot, "home");
  const isolatedRepository = path.join(temporaryRoot, "repository");

  await mkdir(isolatedHome, { recursive: true, mode: 0o700 });

  try {
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

    await copyInstructionsIntoRepository(isolatedRepository);

    await runCommand(
      "pnpm",
      ["dlx", `openwiki@${openWikiVersion}`, "code", "--update", "--print"],
      isolatedRepository,
      createOpenWikiChildEnvironment(process.env, isolatedHome, provider),
    );

    const changedPaths = await collectChangedPaths(isolatedRepository);
    assertAllowedOpenWikiChanges(changedPaths);

    const generatedWiki = path.join(isolatedRepository, "openwiki");
    const generatedFiles = await listFiles(generatedWiki);
    validateGeneratedWikiFiles(generatedFiles);
    await publishDirectoryAtomically(
      generatedWiki,
      path.join(repositoryRoot, "openwiki"),
    );

    console.log(
      `Published ${generatedFiles.length} OpenWiki files from an isolated clone.`,
    );
  } catch (error) {
    try {
      await rm(temporaryRoot, { recursive: true, force: true });
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "OpenWiki generation failed and its temporary clone could not be removed",
      );
    }

    throw error;
  }

  await rm(temporaryRoot, { recursive: true, force: true });
}

async function copyInstructionsIntoRepository(
  isolatedRepository: string,
): Promise<void> {
  const source = path.join(repositoryRoot, "openwiki", "INSTRUCTIONS.md");

  try {
    const sourceStat = await stat(source);
    if (!sourceStat.isFile()) {
      throw new Error("openwiki/INSTRUCTIONS.md must be a regular file");
    }
  } catch (error) {
    if (isFileNotFoundError(error)) {
      throw new Error(
        "Missing openwiki/INSTRUCTIONS.md; define the project documentation brief before generation",
      );
    }
    throw error;
  }

  const targetDirectory = path.join(isolatedRepository, "openwiki");
  await mkdir(targetDirectory, { recursive: true });
  await cp(source, path.join(targetDirectory, "INSTRUCTIONS.md"));
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

async function listFiles(root: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    const relativePath = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) {
      files.push(
        ...(await listFiles(path.join(root, entry.name), relativePath)),
      );
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }

  return files;
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

function isFileNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

updateOpenWiki().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
