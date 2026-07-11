import {
  cp,
  mkdir,
  readFile,
  realpath,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import {
  isSafeZReadPathSegment,
  ZReadWikiManifestSchema,
  type ZReadManifestPage,
} from "@agent-template/shared";

export type ZReadPage = ZReadManifestPage;

export type ZReadWikiSnapshot = {
  generatedAt: string;
  id: string;
  language: string;
  pages: ZReadPage[];
};

export async function stageCurrentZReadWiki(
  sourceWiki: string,
  destinationWiki: string,
): Promise<ZReadWikiSnapshot> {
  const id = (await readFile(path.join(sourceWiki, "current"), "utf8")).trim();
  if (!isSafeZReadPathSegment(id)) {
    throw new Error(`Invalid ZRead current version id: ${id}`);
  }

  const sourceVersion = path.join(sourceWiki, "versions", id);
  const manifestPath = path.join(sourceVersion, "wiki.json");
  const manifest = parseManifest(await readFile(manifestPath, "utf8"), id);

  await mkdir(path.join(destinationWiki, "versions", id), { recursive: true });
  await writeFile(path.join(destinationWiki, "current"), `${id}\n`, "utf8");
  await cp(
    manifestPath,
    path.join(destinationWiki, "versions", id, "wiki.json"),
  );

  for (const page of manifest.pages) {
    const sourcePage = path.join(sourceVersion, page.file);
    await assertRegularPage(sourceVersion, sourcePage, page.file);
    const content = await readFile(sourcePage, "utf8");
    if (/^\s*[-*+]\s+[-*+]\s+/mu.test(content)) {
      throw new Error(`ZRead generated malformed list markers in ${page.file}`);
    }

    const destinationPage = path.join(
      destinationWiki,
      "versions",
      id,
      page.file,
    );
    await mkdir(path.dirname(destinationPage), { recursive: true });
    await cp(sourcePage, destinationPage);
  }

  return manifest;
}

function parseManifest(content: string, expectedId: string): ZReadWikiSnapshot {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch (error) {
    throw new Error("ZRead wiki.json is not valid JSON", { cause: error });
  }

  const parsed = ZReadWikiManifestSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`Invalid ZRead wiki.json: ${parsed.error.message}`);
  }

  const { id } = parsed.data;
  if (id !== expectedId) {
    throw new Error(
      `ZRead wiki.json id ${id} does not match current version ${expectedId}`,
    );
  }
  return {
    generatedAt: parsed.data.generated_at,
    id,
    language: parsed.data.language,
    pages: parsed.data.pages,
  };
}

async function assertRegularPage(
  versionRoot: string,
  file: string,
  relativeFile: string,
): Promise<void> {
  try {
    const [resolvedRoot, resolvedFile, fileStat] = await Promise.all([
      realpath(versionRoot),
      realpath(file),
      stat(file),
    ]);
    const relative = path.relative(resolvedRoot, resolvedFile);
    if (
      !fileStat.isFile() ||
      relative === ".." ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    ) {
      throw new Error(`Invalid ZRead page file: ${relativeFile}`);
    }
  } catch (error) {
    if (isFileNotFoundError(error)) {
      throw new Error(`ZRead page file is missing: ${relativeFile}`, {
        cause: error,
      });
    }
    throw error;
  }
}

function isFileNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
