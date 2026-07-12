import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { prepareMermaidChart, readMermaidDiagram } from "./docs-code";

describe("readMermaidDiagram", () => {
  it("extracts Mermaid fenced code", () => {
    expect(
      readMermaidDiagram(
        createElement(
          "code",
          { className: "language-mermaid" },
          "flowchart LR\n  A --> B\n",
        ),
      ),
    ).toBe("flowchart LR\n  A --> B");
  });

  it("leaves ordinary code fences unchanged", () => {
    expect(
      readMermaidDiagram(
        createElement("code", { className: "language-ts" }, "const x = 1"),
      ),
    ).toBeNull();
  });
});

describe("prepareMermaidChart", () => {
  it("quotes generated flowchart labels containing package scopes", () => {
    expect(
      prepareMermaidChart(
        "graph LR\n  Client[@agent-template/client]\n  Run[Run @agent-template/agent]",
      ),
    ).toBe(
      'graph LR\n  Client["@agent-template/client"]\n  Run["Run @agent-template/agent"]',
    );
  });

  it("does not rewrite ordinary labels or database shapes", () => {
    const chart = "graph LR\n  Web[Web: Next.js]\n  DB[(PostgreSQL)]";
    expect(prepareMermaidChart(chart)).toBe(chart);
  });
});
