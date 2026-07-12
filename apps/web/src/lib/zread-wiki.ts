import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import {
  parseZReadCurrentVersionId,
  type ZReadManifestPage,
  ZReadWikiManifestSchema,
  type ZReadWikiManifest,
} from "@agent-template/shared";

export type ActiveZReadWiki = {
  manifest: ZReadWikiManifest;
  versionRoot: string;
};

export async function loadActiveZReadWiki(
  wikiRoot: string,
): Promise<ActiveZReadWiki> {
  const current = await readFile(path.join(wikiRoot, "current"), "utf8");
  const id = parseZReadCurrentVersionId(current);
  if (!id) {
    throw new Error(`Invalid ZRead current version id: ${current.trim()}`);
  }

  const versionRoot = path.join(wikiRoot, "versions", id);
  const value = JSON.parse(
    await readFile(path.join(versionRoot, "wiki.json"), "utf8"),
  ) as unknown;
  const parsed = ZReadWikiManifestSchema.safeParse(value);
  if (!parsed.success || parsed.data.id !== id) {
    throw new Error(
      `Invalid ZRead wiki.json manifest${parsed.success ? " id" : `: ${parsed.error.message}`}`,
    );
  }

  return { manifest: parsed.data, versionRoot };
}

export async function readActiveZReadPage(
  wiki: ActiveZReadWiki,
  page: ZReadManifestPage,
): Promise<string> {
  const pagePath = path.join(wiki.versionRoot, page.file);
  const resolvedPage = await assertRegularFileInside(
    wiki.versionRoot,
    pagePath,
    `ZRead page file: ${page.file}`,
  );
  return readFile(resolvedPage, "utf8");
}

export async function assertRegularFileInside(
  root: string,
  candidate: string,
  label: string,
): Promise<string> {
  const [resolvedRoot, resolvedFile, fileStat] = await Promise.all([
    realpath(root),
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
    throw new Error(`Invalid ${label}`);
  }
  return resolvedFile;
}
