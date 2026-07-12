import { readFile } from "node:fs/promises";
import path from "node:path";
import { extractZReadSourceCitations } from "@agent-template/shared";
import {
  assertRegularFileInside,
  loadActiveZReadWiki,
  readActiveZReadPage,
} from "./zread-wiki";

type ZReadSourceCatalog = {
  files: ReadonlyMap<string, string>;
  paths: readonly string[];
};

const sourceCatalogsByVersion = new Map<string, Promise<ZReadSourceCatalog>>();

export async function listZReadSourcePaths(
  wikiRoot: string,
): Promise<string[]> {
  const catalog = await loadZReadSourceCatalog(wikiRoot);
  return [...catalog.paths];
}

async function loadZReadSourceCatalog(
  wikiRoot: string,
): Promise<ZReadSourceCatalog> {
  const wiki = await loadActiveZReadWiki(wikiRoot);
  const repositoryRoot = findRepositoryRoot(wikiRoot);
  const key = `${path.resolve(wiki.versionRoot)}\0${repositoryRoot}`;
  const existing = sourceCatalogsByVersion.get(key);
  if (existing) {
    return existing;
  }

  const pending = collectZReadSourceCatalog(wiki, repositoryRoot);
  sourceCatalogsByVersion.set(key, pending);
  try {
    return await pending;
  } catch (error) {
    sourceCatalogsByVersion.delete(key);
    throw error;
  }
}

async function collectZReadSourceCatalog(
  wiki: Awaited<ReturnType<typeof loadActiveZReadWiki>>,
  repositoryRoot: string,
): Promise<ZReadSourceCatalog> {
  const sourcePaths = new Set<string>();

  for (const page of wiki.manifest.pages) {
    const markdown = await readActiveZReadPage(wiki, page);
    for (const citation of extractZReadSourceCitations(markdown)) {
      sourcePaths.add(citation.path);
    }
  }

  const paths = [...sourcePaths].sort();
  const files = new Map<string, string>();
  await Promise.all(
    paths.map(async (sourcePath) => {
      try {
        const resolvedFile = await assertRegularFileInside(
          repositoryRoot,
          path.join(repositoryRoot, sourcePath),
          `ZRead source file: ${sourcePath}`,
        );
        const content = await readFile(resolvedFile, "utf8");
        if (content.includes("\0")) {
          throw new Error(`ZRead source file is not text: ${sourcePath}`);
        }
        files.set(sourcePath, content);
      } catch (error) {
        throw new Error(`ZRead cited source is unreadable: ${sourcePath}`, {
          cause: error,
        });
      }
    }),
  );
  return { files, paths };
}

export async function readZReadSourceFile(
  wikiRoot: string,
  requestedPath: readonly string[],
): Promise<{ content: string; sourcePath: string } | null> {
  const sourcePath = requestedPath.join("/");
  const catalog = await loadZReadSourceCatalog(wikiRoot);
  const content = catalog.files.get(sourcePath);
  if (content === undefined) {
    return null;
  }
  return { content, sourcePath };
}

function findRepositoryRoot(wikiRoot: string): string {
  const configuredRoot = process.env.ZREAD_SOURCE_ROOT?.trim();
  return configuredRoot
    ? path.resolve(configuredRoot)
    : path.resolve(wikiRoot, "../..");
}
