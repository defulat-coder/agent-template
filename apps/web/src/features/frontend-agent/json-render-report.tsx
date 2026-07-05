"use client";

import { defineCatalog } from "@json-render/core";
import { JSONUIProvider, Renderer, defineRegistry, type Spec } from "@json-render/react";
import { schema } from "@json-render/react/schema";
import { z } from "zod";

const tableValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

const reportCatalog = defineCatalog(schema, {
  components: {
    DataTable: {
      props: z.object({
        columns: z.array(z.object({ key: z.string(), label: z.string() })),
        rows: z.array(z.record(z.string(), tableValueSchema)),
        title: z.string()
      }),
      description: "A tabular report section"
    },
    Metric: {
      props: z.object({
        label: z.string(),
        value: z.string()
      }),
      description: "A single report metric"
    },
    MetricGrid: {
      props: z.object({}),
      description: "A responsive metric grid"
    },
    Report: {
      props: z.object({
        description: z.string().optional(),
        title: z.string()
      }),
      description: "A structured report container"
    }
  },
  actions: {}
});

export const { registry: reportRegistry } = defineRegistry(reportCatalog, {
  components: {
    DataTable: ({ props }) => (
      <div className="overflow-hidden rounded-md border border-slate-200">
        <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 font-medium text-slate-950">{props.title}</div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-white text-xs uppercase text-slate-500">
              <tr>
                {props.columns.map((column) => (
                  <th className="border-b border-slate-200 px-3 py-2 font-medium" key={column.key}>
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {props.rows.map((row, index) => (
                <tr className="odd:bg-slate-50" key={index}>
                  {props.columns.map((column) => (
                    <td className="max-w-64 break-words border-b border-slate-100 px-3 py-2 text-slate-700" key={column.key}>
                      {String(row[column.key] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    ),
    Metric: ({ props }) => (
      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
        <div className="text-xs text-slate-500">{props.label}</div>
        <div className="mt-1 text-lg font-semibold text-slate-950">{props.value}</div>
      </div>
    ),
    MetricGrid: ({ children }) => <div className="grid gap-2 sm:grid-cols-4">{children}</div>,
    Report: ({ props, children }) => (
      <div className="rounded-md border border-slate-200 bg-white p-3 text-sm">
        <div className="flex flex-col gap-1">
          <div className="font-semibold text-slate-950">{props.title}</div>
          {props.description ? <div className="text-slate-500">{props.description}</div> : null}
        </div>
        <div className="mt-3 flex flex-col gap-4">{children}</div>
      </div>
    )
  }
});

export function JsonRenderReport({ spec }: { spec: Spec | null }) {
  return (
    <JSONUIProvider registry={reportRegistry} initialState={spec?.state ?? {}}>
      <Renderer fallback={UnknownJsonRenderComponent} registry={reportRegistry} spec={spec} />
    </JSONUIProvider>
  );
}

function UnknownJsonRenderComponent() {
  return <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">暂不支持该结构化组件。</div>;
}
