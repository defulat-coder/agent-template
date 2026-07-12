import { describe, expect, it } from "vitest";
import {
  ZReadWikiManifestSchema,
  extractZReadSourceCitations,
  isSafeZReadSourcePath,
  parseZReadCurrentVersionId,
  parseZReadSourceHref,
} from "./zread-wiki";

const validManifest = {
  generated_at: "2026-07-11T12:30:00Z",
  id: "2026-07-11_2030_abc123",
  language: "zh",
  pages: [
    {
      file: "overview.md",
      group: "开始",
      level: "1",
      section: "开始",
      slug: "overview",
      title: "项目概览",
    },
    {
      file: "architecture/runtime.md",
      group: "架构",
      level: "1",
      section: "架构",
      slug: "architecture/runtime",
      title: "Runtime 架构",
    },
  ],
};

describe("ZReadWikiManifestSchema", () => {
  it("accepts the ZRead current wiki contract", () => {
    expect(ZReadWikiManifestSchema.parse(validManifest)).toEqual(validManifest);
  });

  it("accepts the native ZRead page shape without project normalization", () => {
    const pages = validManifest.pages.map((page) => ({
      file: page.file,
      level: 1,
      section: page.section,
      slug: page.slug,
      title: page.title,
    }));

    expect(
      ZReadWikiManifestSchema.parse({ ...validManifest, pages }).pages,
    ).toEqual(pages);
  });

  it("rejects traversal and duplicate slugs", () => {
    expect(() =>
      ZReadWikiManifestSchema.parse({
        ...validManifest,
        pages: [
          { ...validManifest.pages[0], file: "../outside.md" },
          { ...validManifest.pages[1], slug: "overview" },
        ],
      }),
    ).toThrow();
  });

  it.each(["guide?tab=x", "guide#section", "guide\u0000name", "two words"])(
    "rejects unsafe route segment %j",
    (slug) => {
      expect(() =>
        ZReadWikiManifestSchema.parse({
          ...validManifest,
          pages: [{ ...validManifest.pages[0], slug }, validManifest.pages[1]],
        }),
      ).toThrow();
    },
  );
});

describe("ZRead source citation contract", () => {
  it("extracts source paths and line ranges", () => {
    expect(
      extractZReadSourceCitations(
        "Sources: [入口](apps/api/src/app.ts#L1-L85) [说明](README.md#L3)",
      ),
    ).toEqual([
      { endLine: 85, path: "apps/api/src/app.ts", startLine: 1 },
      { endLine: 3, path: "README.md", startLine: 3 },
    ]);
    expect(parseZReadSourceHref("apps/api/src/app.ts#L10-L20")).toEqual({
      endLine: 20,
      path: "apps/api/src/app.ts",
      startLine: 10,
    });
  });

  it("rejects traversal and secret files", () => {
    expect(isSafeZReadSourcePath(".github/workflows/wiki.yml")).toBe(true);
    expect(isSafeZReadSourcePath(".env.example")).toBe(true);
    expect(isSafeZReadSourcePath("../.env")).toBe(false);
    expect(isSafeZReadSourcePath("apps/web/.env.production")).toBe(false);
    expect(isSafeZReadSourcePath("packages/a/node_modules/x.js")).toBe(false);
    expect(isSafeZReadSourcePath("deploy/private.key")).toBe(false);
  });
});

describe("parseZReadCurrentVersionId", () => {
  it("accepts both native current pointer forms", () => {
    expect(parseZReadCurrentVersionId("2026-07-11_2030_abc123\n")).toBe(
      "2026-07-11_2030_abc123",
    );
    expect(
      parseZReadCurrentVersionId("versions/2026-07-11_2030_abc123\n"),
    ).toBe("2026-07-11_2030_abc123");
  });

  it("rejects pointers outside the native versions directory", () => {
    expect(parseZReadCurrentVersionId("../outside")).toBeNull();
    expect(parseZReadCurrentVersionId("other/version-id")).toBeNull();
    expect(parseZReadCurrentVersionId("version-id/extra")).toBeNull();
    expect(parseZReadCurrentVersionId("drafts/current/wiki")).toBeNull();
  });
});
