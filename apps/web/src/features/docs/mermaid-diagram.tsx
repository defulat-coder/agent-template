"use client";

import { useEffect, useId, useRef, useState } from "react";
import { TriangleAlert } from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@agent-template/ui/components/alert";
import { prepareMermaidChart } from "./docs-code";

type MermaidRenderResult = {
  bindFunctions?: (element: Element) => void;
  svg: string;
};

const mermaidClient = import("mermaid").then(({ default: mermaid }) => {
  mermaid.initialize({
    maxEdges: 500,
    maxTextSize: 50_000,
    securityLevel: "strict",
    startOnLoad: false,
    suppressErrorRendering: true,
    theme: "neutral",
  });
  return mermaid;
});

export function MermaidDiagram({ chart }: { chart: string }) {
  const reactId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<MermaidRenderResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const diagramId = `zread-mermaid-${reactId.replaceAll(":", "")}`;

    void mermaidClient
      .then((mermaid) => mermaid.render(diagramId, prepareMermaidChart(chart)))
      .then((rendered) => {
        if (!cancelled) {
          setResult(rendered);
          setError(null);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setResult(null);
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [chart, reactId]);

  useEffect(() => {
    if (result && containerRef.current) {
      result.bindFunctions?.(containerRef.current);
    }
  }, [result]);

  if (error) {
    return (
      <Alert className="my-6" data-not-typeset variant="destructive">
        <TriangleAlert />
        <AlertTitle>图表渲染失败</AlertTitle>
        <AlertDescription>
          <p>{error}</p>
          <pre className="mt-2 max-w-full overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs text-foreground">
            <code>{chart}</code>
          </pre>
        </AlertDescription>
      </Alert>
    );
  }

  if (!result) {
    return (
      <div
        aria-label="正在渲染 Mermaid 图表"
        className="my-6 grid min-h-44 animate-pulse place-items-center rounded-xl border bg-muted/40 text-sm text-muted-foreground"
        data-not-typeset
        role="status"
      >
        正在渲染图表…
      </div>
    );
  }

  return (
    <div
      aria-label="Mermaid 图表"
      className="my-6 overflow-x-auto rounded-xl border bg-card p-4 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
      data-not-typeset
      dangerouslySetInnerHTML={{ __html: result.svg }}
      ref={containerRef}
      role="img"
    />
  );
}
