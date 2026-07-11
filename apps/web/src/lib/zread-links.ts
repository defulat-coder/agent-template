import path from "node:path";
import { parseZReadSourceHref } from "@agent-template/shared";

export function createZReadHeadingId(title: string): string {
  return title
    .trim()
    .toLocaleLowerCase("zh-CN")
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
    .replace(/\s+/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-|-$/gu, "");
}

export function resolveZReadHref(
  currentSlug: readonly string[],
  href: string,
  indexSlug: string,
  knownSlugs: ReadonlySet<string>,
  knownSourcePaths: ReadonlySet<string> = new Set(),
): string {
  if (
    href.startsWith("#") ||
    href.startsWith("?") ||
    href.startsWith("//") ||
    /^[a-z][a-z\d+.-]*:/iu.test(href)
  ) {
    return href;
  }

  const match = href.match(/^([^?#]*)([?#].*)?$/u);
  const rawPath = match?.[1];
  if (!rawPath) {
    return href;
  }

  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(rawPath);
  } catch {
    return href;
  }
  if (decodedPath.includes("\\")) {
    return href;
  }

  const fromRoot = decodedPath.startsWith("/");
  const base = fromRoot ? [] : currentSlug.slice(0, -1);
  const normalized = path.posix.normalize(
    path.posix.join(...base, decodedPath.replace(/^\/+/, "")),
  );
  if (
    normalized === ".." ||
    normalized.startsWith("../") ||
    path.posix.isAbsolute(normalized)
  ) {
    return href;
  }

  const markdownLink = normalized.toLowerCase().endsWith(".md");
  const documentSlug = markdownLink
    ? normalized.slice(0, -".md".length)
    : normalized;
  if (!knownSlugs.has(documentSlug)) {
    const source = parseZReadSourceHref(href);
    if (source && knownSourcePaths.has(source.path)) {
      const encodedSourcePath = source.path
        .split("/")
        .map(encodeURIComponent)
        .join("/");
      const sourceSuffix = source.startLine ? `#L${source.startLine}` : "";
      return `/docs/source/${encodedSourcePath}${sourceSuffix}`;
    }
    return href;
  }
  const route = documentSlug === indexSlug ? "/docs" : `/docs/${documentSlug}`;
  return `${route}${match?.[2] ?? ""}`;
}
