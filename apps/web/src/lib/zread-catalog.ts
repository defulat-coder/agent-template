import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import {
  isSafeZReadPathSegment,
  ZReadWikiManifestSchema,
  type ZReadManifestPage,
} from "@agent-template/shared";

export type ZReadCatalogEntry = {
  href: string;
  relativePath: string;
  section: string;
  slug: string[];
  sourceSlug: string;
  title: string;
};

export type ZReadDocument = ZReadCatalogEntry & {
  content: string;
};

type ActiveWiki = {
  pages: ZReadManifestPage[];
  versionRoot: string;
};

export async function listZReadDocuments(
  wikiRoot: string,
): Promise<ZReadCatalogEntry[]> {
  const wiki = await loadActiveWiki(wikiRoot);
  return wiki.pages.map((page, index) => createCatalogEntry(page, index));
}

export async function readZReadDocument(
  wikiRoot: string,
  requestedSlug: readonly string[],
): Promise<ZReadDocument | null> {
  if (!isSafeRequestedSlug(requestedSlug)) {
    return null;
  }

  const wiki = await loadActiveWiki(wikiRoot);
  const requestedSourceSlug =
    requestedSlug.length === 0 ? wiki.pages[0]?.slug : requestedSlug.join("/");
  const pageIndex = wiki.pages.findIndex(
    (page) => page.slug === requestedSourceSlug,
  );
  if (pageIndex < 0) {
    return null;
  }

  const page = wiki.pages[pageIndex];
  if (!page) {
    return null;
  }
  const pagePath = path.join(wiki.versionRoot, page.file);
  const [resolvedVersionRoot, resolvedPage, pageStat] = await Promise.all([
    realpath(wiki.versionRoot),
    realpath(pagePath),
    stat(pagePath),
  ]);
  const relativePage = path.relative(resolvedVersionRoot, resolvedPage);
  if (
    !pageStat.isFile() ||
    relativePage === ".." ||
    relativePage.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePage)
  ) {
    throw new Error(`Invalid ZRead page file: ${page.file}`);
  }

  return {
    ...createCatalogEntry(page, pageIndex),
    content: await readFile(resolvedPage, "utf8"),
  };
}

async function loadActiveWiki(wikiRoot: string): Promise<ActiveWiki> {
  const id = (await readFile(path.join(wikiRoot, "current"), "utf8")).trim();
  if (!isSafeZReadPathSegment(id)) {
    throw new Error(`Invalid ZRead current version id: ${id}`);
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

  return { pages: parsed.data.pages, versionRoot };
}

function createCatalogEntry(
  page: ZReadManifestPage,
  index: number,
): ZReadCatalogEntry {
  const slug = index === 0 ? [] : page.slug.split("/");
  return {
    href: slug.length === 0 ? "/docs" : `/docs/${page.slug}`,
    relativePath: page.file,
    section: page.group || page.section,
    slug,
    sourceSlug: page.slug,
    title: page.title,
  };
}

function isSafeRequestedSlug(slug: readonly string[]): boolean {
  return slug.every(isSafePathSegment);
}

function isSafePathSegment(segment: string): boolean {
  return isSafeZReadPathSegment(segment);
}
