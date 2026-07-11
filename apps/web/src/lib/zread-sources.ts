import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import {
  isSafeZReadPathSegment,
  ZReadSourceIndexSchema,
  type ZReadSourceIndex,
} from "@agent-template/shared";

export async function listZReadSourcePaths(
  wikiRoot: string,
): Promise<string[]> {
  const index = await loadActiveSourceIndex(wikiRoot);
  return index.sources.map((source) => source.path);
}

export async function readZReadSourceFile(
  wikiRoot: string,
  requestedPath: readonly string[],
): Promise<{ content: string; sourcePath: string } | null> {
  const sourcePath = requestedPath.join("/");
  const index = await loadActiveSourceIndex(wikiRoot);
  if (!index.sources.some((source) => source.path === sourcePath)) {
    return null;
  }

  const configuredRoot = process.env.ZREAD_SOURCE_ROOT?.trim();
  const repositoryRoot = configuredRoot
    ? path.resolve(configuredRoot)
    : path.resolve(wikiRoot, "../..");
  const candidate = path.join(repositoryRoot, sourcePath);

  try {
    const [resolvedRoot, resolvedFile, fileStat] = await Promise.all([
      realpath(repositoryRoot),
      realpath(candidate),
      stat(candidate),
    ]);
    const relativeFile = path.relative(resolvedRoot, resolvedFile);
    if (
      !fileStat.isFile() ||
      relativeFile === ".." ||
      relativeFile.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativeFile)
    ) {
      throw new Error(`Invalid ZRead source file: ${sourcePath}`);
    }

    const content = await readFile(resolvedFile, "utf8");
    if (content.includes("\0")) {
      throw new Error(`ZRead source file is not text: ${sourcePath}`);
    }
    return { content, sourcePath };
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

async function loadActiveSourceIndex(
  wikiRoot: string,
): Promise<ZReadSourceIndex> {
  const id = (await readFile(path.join(wikiRoot, "current"), "utf8")).trim();
  if (!isSafeZReadPathSegment(id)) {
    throw new Error(`Invalid ZRead current version id: ${id}`);
  }

  const value = JSON.parse(
    await readFile(
      path.join(wikiRoot, "versions", id, "sources.json"),
      "utf8",
    ),
  ) as unknown;
  const parsed = ZReadSourceIndexSchema.safeParse(value);
  if (!parsed.success || parsed.data.id !== id) {
    throw new Error(
      `Invalid ZRead sources.json index${parsed.success ? " id" : `: ${parsed.error.message}`}`,
    );
  }
  return parsed.data;
}

function isFileNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
