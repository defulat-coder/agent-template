// Validates the active ZRead Wiki and stages its native directory unchanged.
import { cp, readFile, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import {
  extractZReadSourceCitations,
  parseZReadCurrentVersionId,
  type ZReadManifestPage,
  ZReadWikiManifestSchema,
  type ZReadWikiManifest,
} from "@agent-template/shared";

export type ZReadPage = ZReadManifestPage;

export type ZReadWikiSnapshot = {
  generatedAt: string;
  id: string;
  language: string;
  pages: ZReadPage[];
};

export async function stageNativeZReadWiki(
  sourceWiki: string,
  destinationWiki: string,
  assertSafeText: (content: string, label: string) => void = () => undefined,
): Promise<ZReadWikiSnapshot> {
  await validateNativeWikiTree(sourceWiki, assertSafeText);

  const current = await readFile(path.join(sourceWiki, "current"), "utf8");
  const id = parseZReadCurrentVersionId(current);
  if (!id) {
    throw new Error(`Invalid ZRead current version id: ${current.trim()}`);
  }

  const sourceVersion = path.join(sourceWiki, "versions", id);
  const manifestContent = await readFile(
    path.join(sourceVersion, "wiki.json"),
    "utf8",
  );
  assertSafeText(manifestContent, "ZRead wiki manifest");
  const manifest = parseManifest(manifestContent, id);
  const repositoryRoot = path.resolve(sourceWiki, "../..");

  for (const page of manifest.pages) {
    const sourcePage = path.join(sourceVersion, page.file);
    await assertRegularFile(
      sourceVersion,
      sourcePage,
      `ZRead page file: ${page.file}`,
    );
    const content = await readFile(sourcePage, "utf8");
    assertSafeText(content, `ZRead page ${page.file}`);
    if (/^\s*[-*+]\s+[-*+]\s+/mu.test(content)) {
      throw new Error(`ZRead generated malformed list markers in ${page.file}`);
    }
    await validateSourceCitations(repositoryRoot, content, assertSafeText);
  }

  await cp(sourceWiki, destinationWiki, {
    preserveTimestamps: true,
    recursive: true,
  });

  return {
    generatedAt: manifest.generated_at,
    id: manifest.id,
    language: manifest.language,
    pages: manifest.pages,
  };
}

async function validateNativeWikiTree(
  wikiRoot: string,
  assertSafeText: (content: string, label: string) => void,
): Promise<void> {
  const pendingDirectories = [wikiRoot];
  while (pendingDirectories.length > 0) {
    const directory = pendingDirectories.pop();
    if (!directory) {
      continue;
    }
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      const relativeFile = path.relative(wikiRoot, file);
      if (entry.isDirectory()) {
        pendingDirectories.push(file);
        continue;
      }
      if (!entry.isFile()) {
        throw new Error(
          `ZRead native wiki contains a non-regular file: ${relativeFile}`,
        );
      }
      const content = await readFile(file, "utf8");
      if (content.includes("\0")) {
        throw new Error(`ZRead native wiki file is not text: ${relativeFile}`);
      }
      assertSafeText(content, `ZRead native wiki file ${relativeFile}`);
    }
  }
}

async function validateSourceCitations(
  repositoryRoot: string,
  markdown: string,
  assertSafeText: (content: string, label: string) => void,
): Promise<void> {
  const citations = new Map(
    extractZReadSourceCitations(markdown).map((citation) => [
      `${citation.path}:${citation.startLine}:${citation.endLine}`,
      citation,
    ]),
  );

  for (const citation of citations.values()) {
    const sourceFile = path.join(repositoryRoot, citation.path);
    await assertRegularFile(
      repositoryRoot,
      sourceFile,
      `ZRead cited source file: ${citation.path}`,
    );
    const content = await readFile(sourceFile, "utf8");
    if (content.includes("\0")) {
      throw new Error(`ZRead cited source file is not text: ${citation.path}`);
    }
    assertSafeText(content, `ZRead cited source ${citation.path}`);
    const lineCount = content.split("\n").length;
    if (citation.startLine > lineCount) {
      throw new Error(
        `ZRead source start ${citation.path}#L${citation.startLine} exceeds ${lineCount} lines`,
      );
    }
  }
}

function parseManifest(content: string, expectedId: string): ZReadWikiManifest {
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
  if (parsed.data.id !== expectedId) {
    throw new Error(
      `ZRead wiki.json id ${parsed.data.id} does not match current version ${expectedId}`,
    );
  }
  return parsed.data;
}

async function assertRegularFile(
  root: string,
  file: string,
  label: string,
): Promise<void> {
  try {
    const [resolvedRoot, resolvedFile, fileStat] = await Promise.all([
      realpath(root),
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
      throw new Error(`Invalid ${label}`);
    }
  } catch (error) {
    if (isFileNotFoundError(error)) {
      throw new Error(`${label} is missing`, { cause: error });
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
