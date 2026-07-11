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
  group: z.string().min(1),
  level: z.number().int(),
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
export type ZReadWikiManifest = z.infer<typeof ZReadWikiManifestSchema>;

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

export function isSafeZReadPathSegment(segment: string): boolean {
  return (
    /^[\p{Letter}\p{Number}](?:[\p{Letter}\p{Number}._-]*[\p{Letter}\p{Number}])?$/u.test(
      segment,
    ) &&
    segment !== "." &&
    segment !== ".."
  );
}
