import { Children, isValidElement, type ReactNode } from "react";

export function readMermaidDiagram(node: ReactNode): string | null {
  const children = Children.toArray(node);
  if (children.length !== 1) {
    return null;
  }
  const code = children[0];
  if (
    !isValidElement<{ children?: ReactNode; className?: string }>(code) ||
    !code.props.className?.split(/\s+/u).includes("language-mermaid")
  ) {
    return null;
  }
  return readText(code.props.children).trim();
}

export function prepareMermaidChart(chart: string): string {
  return chart.replace(
    /(\b[A-Za-z_][\w-]*)\[([^\]"\r\n]*@[^\]"\r\n]*)\]/gu,
    (_match, nodeId: string, label: string) =>
      `${nodeId}["${label.replaceAll("\\", "\\\\")}"]`,
  );
}

function readText(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) => {
      if (typeof child === "string" || typeof child === "number") {
        return String(child);
      }
      if (isValidElement<{ children?: ReactNode }>(child)) {
        return readText(child.props.children);
      }
      return "";
    })
    .join("");
}
