// Validates and stages the current ZRead Wiki version.
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
  extractZReadSourceCitations,
  isSafeZReadPathSegment,
  type ZReadSourceCitation,
  type ZReadSourceIndex,
  ZReadWikiManifestSchema,
  type ZReadManifestPage,
  type ZReadWikiManifest,
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
  assertSafeText: (content: string, label: string) => void = () => undefined,
): Promise<ZReadWikiSnapshot> {
  const current = (
    await readFile(path.join(sourceWiki, "current"), "utf8")
  ).trim();
  const id = parseCurrentVersionId(current);

  const sourceVersion = path.join(sourceWiki, "versions", id);
  const manifestPath = path.join(sourceVersion, "wiki.json");
  const manifestContent = await readFile(manifestPath, "utf8");
  assertSafeText(manifestContent, "ZRead wiki manifest");
  const manifest = parseManifest(manifestContent, id);
  const snapshot = createSnapshot(manifest);
  const sourceCitations = new Map<
    string,
    Map<string, ZReadSourceCitation>
  >();

  await mkdir(path.join(destinationWiki, "versions", id), { recursive: true });
  await writeFile(path.join(destinationWiki, "current"), `${id}\n`, "utf8");
  await writeFile(
    path.join(destinationWiki, "versions", id, "wiki.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  for (const page of manifest.pages) {
    const sourcePage = path.join(sourceVersion, page.file);
    await assertRegularPage(sourceVersion, sourcePage, page.file);
    const content = await readFile(sourcePage, "utf8");
    assertSafeText(content, `ZRead page ${page.file}`);
    if (/^\s*[-*+]\s+[-*+]\s+/mu.test(content)) {
      throw new Error(`ZRead generated malformed list markers in ${page.file}`);
    }
    for (const citation of extractZReadSourceCitations(content)) {
      const ranges = sourceCitations.get(citation.path) ?? new Map();
      ranges.set(`${citation.startLine}:${citation.endLine}`, citation);
      sourceCitations.set(citation.path, ranges);
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

  const sourceIndex = await createSourceIndex(
    id,
    path.resolve(sourceWiki, "../.."),
    sourceCitations,
    assertSafeText,
  );
  await writeFile(
    path.join(destinationWiki, "versions", id, "sources.json"),
    `${JSON.stringify(sourceIndex, null, 2)}\n`,
    "utf8",
  );

  return snapshot;
}

async function createSourceIndex(
  id: string,
  repositoryRoot: string,
  citations: ReadonlyMap<string, ReadonlyMap<string, ZReadSourceCitation>>,
  assertSafeText: (content: string, label: string) => void,
): Promise<ZReadSourceIndex> {
  const sources: ZReadSourceIndex["sources"] = [];
  for (const sourcePath of [...citations.keys()].sort()) {
    const sourceFile = path.join(repositoryRoot, sourcePath);
    await assertRegularSource(repositoryRoot, sourceFile, sourcePath);
    const content = await readFile(sourceFile, "utf8");
    if (content.includes("\0")) {
      throw new Error(`ZRead cited source file is not text: ${sourcePath}`);
    }
    assertSafeText(content, `ZRead cited source ${sourcePath}`);
    const lineCount = content.split("\n").length;
    const canonicalRanges = new Map<string, { end: number; start: number }>();
    for (const citation of citations.get(sourcePath)?.values() ?? []) {
      if (citation.startLine > lineCount) {
        throw new Error(
          `ZRead source start ${sourcePath}#L${citation.startLine} exceeds ${lineCount} lines`,
        );
      }
      const range = {
        end: Math.min(citation.endLine, lineCount),
        start: citation.startLine,
      };
      canonicalRanges.set(`${range.start}:${range.end}`, range);
    }
    const ranges = [...canonicalRanges.values()].sort(
      (left, right) => left.start - right.start || left.end - right.end,
    );
    if (ranges.length === 0) {
      throw new Error(
        `ZRead cited source has no valid ranges: ${sourcePath}`,
      );
    }
    sources.push({ path: sourcePath, ranges });
  }
  return { id, sources };
}

function parseCurrentVersionId(current: string): string {
  const parts = current.split("/");
  const id = parts.length === 2 && parts[0] === "versions" ? parts[1] : current;
  if (!isSafeZReadPathSegment(id)) {
    throw new Error(`Invalid ZRead current version id: ${current}`);
  }
  return id;
}

function parseManifest(content: string, expectedId: string): ZReadWikiManifest {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch (error) {
    throw new Error("ZRead wiki.json is not valid JSON", { cause: error });
  }

  const parsed = ZReadWikiManifestSchema.safeParse(
    normalizeVendorManifest(value),
  );
  if (!parsed.success) {
    throw new Error(`Invalid ZRead wiki.json: ${parsed.error.message}`);
  }

  const { id } = parsed.data;
  if (id !== expectedId) {
    throw new Error(
      `ZRead wiki.json id ${id} does not match current version ${expectedId}`,
    );
  }
  return parsed.data;
}

function normalizeVendorManifest(value: unknown): unknown {
  if (!isRecord(value) || !Array.isArray(value.pages)) {
    return value;
  }
  return {
    ...value,
    pages: value.pages.map((page) => {
      if (!isRecord(page)) {
        return page;
      }
      return {
        ...page,
        group:
          typeof page.group === "string" && page.group
            ? page.group
            : page.section,
        level: typeof page.level === "number" ? String(page.level) : page.level,
      };
    }),
  };
}

function createSnapshot(manifest: ZReadWikiManifest): ZReadWikiSnapshot {
  return {
    generatedAt: manifest.generated_at,
    id: manifest.id,
    language: manifest.language,
    pages: manifest.pages,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

async function assertRegularSource(
  repositoryRoot: string,
  file: string,
  relativeFile: string,
): Promise<void> {
  try {
    const [resolvedRoot, resolvedFile, fileStat] = await Promise.all([
      realpath(repositoryRoot),
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
      throw new Error(`Invalid ZRead cited source file: ${relativeFile}`);
    }
  } catch (error) {
    if (isFileNotFoundError(error)) {
      throw new Error(`ZRead cited source file is missing: ${relativeFile}`, {
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
