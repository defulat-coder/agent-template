import {
  isSafeZReadPathSegment,
  type ZReadManifestPage,
} from "@agent-template/shared";
import { loadActiveZReadWiki, readActiveZReadPage } from "./zread-wiki";

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

export async function listZReadDocuments(
  wikiRoot: string,
): Promise<ZReadCatalogEntry[]> {
  const wiki = await loadActiveZReadWiki(wikiRoot);
  return wiki.manifest.pages.map((page, index) =>
    createCatalogEntry(page, index),
  );
}

export async function readZReadDocument(
  wikiRoot: string,
  requestedSlug: readonly string[],
): Promise<ZReadDocument | null> {
  if (!isSafeRequestedSlug(requestedSlug)) {
    return null;
  }

  const wiki = await loadActiveZReadWiki(wikiRoot);
  const requestedSourceSlug =
    requestedSlug.length === 0
      ? wiki.manifest.pages[0]?.slug
      : requestedSlug.join("/");
  const pageIndex = wiki.manifest.pages.findIndex(
    (page) => page.slug === requestedSourceSlug,
  );
  if (pageIndex < 0) {
    return null;
  }

  const page = wiki.manifest.pages[pageIndex];
  if (!page) {
    return null;
  }
  return {
    ...createCatalogEntry(page, pageIndex),
    content: await readActiveZReadPage(wiki, page),
  };
}

function createCatalogEntry(
  page: ZReadManifestPage,
  index: number,
): ZReadCatalogEntry {
  const slug = index === 0 ? [] : page.slug.split("/");
  return {
    href: slug.length === 0 ? "/docs" : `/docs/${page.slug}`,
    relativePath: page.file,
    section: page.group ?? page.section,
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
