import { describe, expect, it } from "vitest";
import { ZReadWikiManifestSchema } from "./zread-wiki";

const validManifest = {
  generated_at: "2026-07-11T12:30:00Z",
  id: "2026-07-11_2030_abc123",
  language: "zh",
  pages: [
    {
      file: "overview.md",
      group: "开始",
      level: 1,
      section: "开始",
      slug: "overview",
      title: "项目概览",
    },
    {
      file: "architecture/runtime.md",
      group: "架构",
      level: 1,
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
});
