"use client";

import { useMemo } from "react";
import { applySpecStreamPatch } from "@json-render/core";
import type { Spec } from "@json-render/react";
import type { AgentJsonRenderUiPatch } from "@agent-template/shared";
import { JsonRenderReport } from "./json-render-report";

export function JsonRenderStreamPanel({ patches, title }: { patches: AgentJsonRenderUiPatch[]; title: string }) {
  const spec = useMemo(() => compileJsonRenderSpec(patches), [patches]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
        <span>{title}</span>
        <span>{patches.length} patches</span>
      </div>
      <JsonRenderReport spec={spec} />
    </div>
  );
}

function compileJsonRenderSpec(patches: AgentJsonRenderUiPatch[]) {
  const spec: Record<string, unknown> = { elements: {}, root: "" };

  for (const { patch } of patches) {
    applySpecStreamPatch(spec, patch);
  }

  return spec.root ? (spec as unknown as Spec) : null;
}
