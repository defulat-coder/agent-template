import { z } from "zod";

export const ZReadPageFileSchema = z
  .string()
  .min(1)
  .refine(isSafeZReadPageFile, "must be a safe relative Markdown path");

export const ZReadPageSlugSchema = z
  .string()
  .min(1)
  .refine(isSafeZReadSlug, "must contain safe path segments");

export const ZReadManifestPageSchema = z.object({
  file: ZReadPageFileSchema,
  group: z.string().min(1).optional(),
  level: z.union([z.string().min(1), z.number()]),
  section: z.string().min(1),
  slug: ZReadPageSlugSchema,
  title: z.string().min(1),
});

export const ZReadWikiManifestSchema = z
  .object({
    generated_at: z.string().min(1),
    id: z.string().min(1).refine(isSafeZReadPathSegment),
    language: z.string().min(1),
    pages: z.array(ZReadManifestPageSchema).min(2),
  })
  .superRefine((manifest, context) => {
    const slugs = new Set<string>();
    for (const [index, page] of manifest.pages.entries()) {
      if (slugs.has(page.slug)) {
        context.addIssue({
          code: "custom",
          message: `duplicate page slug: ${page.slug}`,
          path: ["pages", index, "slug"],
        });
      }
      slugs.add(page.slug);
    }
  });

export type ZReadManifestPage = z.infer<typeof ZReadManifestPageSchema>;
export type ZReadSourceCitation = {
  endLine: number;
  path: string;
  startLine: number;
};
export type ZReadWikiManifest = z.infer<typeof ZReadWikiManifestSchema>;

const ZREAD_SOURCE_CITATION_PATTERN = /\]\(([^()\s#]+)#L(\d+)(?:-L(\d+))?\)/gu;

export function extractZReadSourceCitations(
  markdown: string,
): ZReadSourceCitation[] {
  const citations: ZReadSourceCitation[] = [];
  for (const match of markdown.matchAll(ZREAD_SOURCE_CITATION_PATTERN)) {
    const encodedPath = match[1];
    const start = match[2];
    if (!encodedPath || !start) {
      continue;
    }
    try {
      const sourcePath = decodeURIComponent(encodedPath);
      const startLine = Number(start);
      const endLine = Number(match[3] ?? start);
      if (
        isSafeZReadSourcePath(sourcePath) &&
        Number.isSafeInteger(startLine) &&
        Number.isSafeInteger(endLine) &&
        startLine > 0 &&
        endLine >= startLine
      ) {
        citations.push({ endLine, path: sourcePath, startLine });
      }
    } catch {
      // Invalid URL encoding is not a publishable source citation.
    }
  }
  return citations;
}

export function parseZReadSourceHref(href: string): {
  endLine?: number;
  path: string;
  startLine?: number;
} | null {
  const match = href.match(/^([^?#]+)(?:#L(\d+)(?:-L(\d+))?)?$/u);
  const encodedPath = match?.[1];
  if (!encodedPath) {
    return null;
  }
  try {
    const sourcePath = decodeURIComponent(encodedPath);
    if (!isSafeZReadSourcePath(sourcePath)) {
      return null;
    }
    const startLine = match?.[2] ? Number(match[2]) : undefined;
    const endLine = match?.[3]
      ? Number(match[3])
      : startLine === undefined
        ? undefined
        : startLine;
    return startLine === undefined
      ? { path: sourcePath }
      : { endLine: endLine ?? startLine, path: sourcePath, startLine };
  } catch {
    return null;
  }
}

export function isSafeZReadPageFile(file: string): boolean {
  return (
    file.endsWith(".md") &&
    !file.startsWith("/") &&
    !file.includes("\\") &&
    file.split("/").every(isSafeZReadPathSegment)
  );
}

export function isSafeZReadSlug(slug: string): boolean {
  return slug.split("/").every(isSafeZReadPathSegment);
}

export function isSafeZReadSourcePath(sourcePath: string): boolean {
  if (
    !sourcePath ||
    sourcePath.startsWith("/") ||
    sourcePath.includes("\\") ||
    sourcePath.includes("\0")
  ) {
    return false;
  }

  const segments = sourcePath.split("/");
  if (
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        [...segment].some((character) => character.charCodeAt(0) < 32),
    )
  ) {
    return false;
  }

  const basename = segments.at(-1) ?? "";
  const forbiddenSegments = new Set([".git", ".next", "node_modules"]);
  const forbiddenNames = new Set([
    ".git-credentials",
    ".netrc",
    ".npmrc",
    ".pypirc",
    "credentials.json",
  ]);
  return (
    !segments.some((segment) => forbiddenSegments.has(segment)) &&
    !forbiddenNames.has(basename) &&
    (!basename.startsWith(".env") || basename === ".env.example") &&
    !/\.(?:key|p12|pem|pfx)$/iu.test(basename)
  );
}

export function isSafeZReadPathSegment(segment: string): boolean {
  return (
    /^[\p{Letter}\p{Number}](?:[\p{Letter}\p{Number}._-]*[\p{Letter}\p{Number}])?$/u.test(
      segment,
    ) &&
    segment !== "." &&
    segment !== ".."
  );
}

export function parseZReadCurrentVersionId(current: string): string | null {
  const parts = current.trim().split("/");
  const id =
    parts.length === 1
      ? parts[0]
      : parts.length === 2 && parts[0] === "versions"
        ? parts[1]
        : undefined;
  return id && isSafeZReadPathSegment(id) ? id : null;
}
