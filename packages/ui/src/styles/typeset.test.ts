/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const rawCss = readFileSync(new URL("./typeset.css", import.meta.url), "utf8");
const css = rawCss.replace(/\/\*[\s\S]*?\*\//gu, "");

describe("shadcn/typeset", () => {
  it.each([
    ":last-child",
    ":last-of-type",
    ":nth-last-child",
    ":nth-last-of-type",
    ":only-child",
    ":only-of-type",
    ":has(",
    ":empty",
  ])("keeps streamed blocks stable without %s", (selector) => {
    expect(css).not.toContain(selector);
  });

  it("only spaces content forward", () => {
    expect(css).not.toContain("margin-bottom");
    expect(css).not.toMatch(/[^-]margin:/u);

    const blockEnds = [...css.matchAll(/margin-block-end: ([^;]+);/gu)].map(
      (match) => match[1],
    );
    expect(blockEnds.length).toBeGreaterThan(0);
    expect(blockEnds.every((value) => value === "0")).toBe(true);
  });

  it("uses tabular numerals in tables", () => {
    expect(css).toContain("font-variant-numeric: tabular-nums");
  });
});
