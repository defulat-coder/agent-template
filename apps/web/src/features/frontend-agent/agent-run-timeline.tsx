"use client";

import { useState } from "react";
import type { AgentArtifact, AgentJsonRenderUiPatch, AgentRunEvent, AgentRunUi, AgentRunsDashboardUi } from "@agent-template/shared";
import { JsonRenderStreamPanel } from "./json-render-stream-panel";

type TimelineRow =
  | { kind: "event"; event: AgentRunEvent }
  | { id: string; kind: "json-render"; patches: AgentJsonRenderUiPatch[]; title: string };

export function AgentRunTimeline({ events }: { events: AgentRunEvent[] }) {
  const rows = collapseJsonRenderEvents(events);

  return (
    <section className="rounded-md border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-slate-950">运行事件</h2>
        <p className="text-sm text-slate-500">来自当前 Agent Chat SSE 连接的运行事件。</p>
      </div>

      {rows.length ? (
        <div className="mt-4 flex flex-col gap-3">
          {rows.map((row, index) => (
            row.kind === "json-render" ? (
              <LogRow key={`json-render-${row.id}`} label={`Structured UI: ${row.title}`} tone="blue">
                {`${row.patches.length} patches`}
              </LogRow>
            ) : (
              <AgentRunEventRow event={row.event} key={`${row.event.kind}-${index}`} />
            )
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-500">暂无运行事件。</p>
      )}
    </section>
  );
}

function AgentRunEventRow({ event }: { event: AgentRunEvent }) {
  if (event.kind === "tool-call") {
    return (
      <LogRow label={`Tool call: ${event.tool}`} tone="blue">
        {event.input}
      </LogRow>
    );
  }

  if (event.kind === "tool-result") {
    return <LogRow label={`Tool result: ${event.tool}`} tone="green" />;
  }

  if (event.kind === "text") {
    return <LogRow label="Agent output">{event.text}</LogRow>;
  }

  if (event.kind === "done") {
    return (
      <LogRow label="Final result" tone="green">
        {event.result}
      </LogRow>
    );
  }

  if (event.kind === "error") {
    return (
      <LogRow label="Run failed" tone="red">
        {event.message}
      </LogRow>
    );
  }

  if (event.kind === "artifacts") {
    return <ArtifactTabs tabs={event.tabs} />;
  }

  if (event.kind === "ui") {
    return <AgentRunUiPanel ui={event.ui} />;
  }

  return <LogRow label="Unknown event">{event.text}</LogRow>;
}

function LogRow({ children, label, tone = "slate" }: { children?: string; label: string; tone?: "blue" | "green" | "red" | "slate" }) {
  const toneClass = {
    blue: "border-blue-200 bg-blue-50 text-blue-900",
    green: "border-green-200 bg-green-50 text-green-900",
    red: "border-red-200 bg-red-50 text-red-900",
    slate: "border-slate-200 bg-slate-50 text-slate-900"
  }[tone];

  return (
    <div className={`rounded-md border px-3 py-2 text-sm ${toneClass}`}>
      <div className="font-medium">{label}</div>
      {children ? <pre className="mt-2 whitespace-pre-wrap break-words font-sans leading-6">{children}</pre> : null}
    </div>
  );
}

function ArtifactTabs({ tabs }: { tabs: AgentArtifact[] }) {
  const [activeId, setActiveId] = useState(tabs[0]?.id ?? "");
  const active = tabs.find((tab) => tab.id === activeId) ?? tabs[0];

  if (!active) {
    return <LogRow label="Artifacts">No artifact content.</LogRow>;
  }

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {tabs.map((tab) => (
          <button
            className={`rounded-md px-2 py-1 text-left ${tab.id === active.id ? "bg-slate-950 text-white" : "bg-white text-slate-700"}`}
            key={tab.id}
            onClick={() => setActiveId(tab.id)}
            type="button"
          >
            {tab.label} <span className="text-xs opacity-70">{tab.hint}</span>
          </button>
        ))}
        <button
          className="ml-auto rounded-md bg-white px-2 py-1 text-slate-700"
          onClick={() => void navigator.clipboard?.writeText(active.content)}
          type="button"
        >
          复制
        </button>
      </div>
      <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words text-slate-900">{active.content}</pre>
    </div>
  );
}

function AgentRunUiPanel({ ui }: { ui: AgentRunUi }) {
  if (ui.component === "json-render") {
    return <JsonRenderStreamPanel patches={[ui]} title={ui.title} />;
  }

  return <AgentRunsDashboardPanel ui={ui} />;
}

function AgentRunsDashboardPanel({ ui }: { ui: AgentRunsDashboardUi }) {
  const [selectedRunId, setSelectedRunId] = useState(ui.data.runs[0]?.runId ?? "");
  const selectedRun = ui.data.runs.find((run) => run.runId === selectedRunId) ?? ui.data.runs[0];
  const maxEvents = Math.max(1, ...ui.data.runs.map((run) => run.eventCount));

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3 text-sm">
      <div className="flex flex-col gap-1">
        <div className="font-semibold text-slate-950">{ui.title}</div>
        <div className="text-slate-500">来自 MCP Host 调用 Toolbox 后随 Chat SSE 返回。</div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        <Metric label="总运行数" value={String(ui.data.metrics.totalRuns)} />
        <Metric label="完成" value={String(ui.data.metrics.completedRuns)} />
        <Metric label="失败" value={String(ui.data.metrics.failedRuns)} />
        <Metric label="失败率" value={`${Math.round(ui.data.metrics.failureRate * 100)}%`} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-2">
          {ui.data.runs.length ? (
            ui.data.runs.map((run) => (
              <button
                className={`w-full rounded-md border px-3 py-2 text-left transition ${
                  run.runId === selectedRun?.runId
                    ? "border-slate-900 bg-slate-950 text-white"
                    : "border-slate-200 bg-slate-50 text-slate-900 hover:border-slate-400"
                }`}
                key={run.runId}
                onClick={() => setSelectedRunId(run.runId)}
                type="button"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate font-medium">{run.runId}</span>
                  <span className="shrink-0 text-xs opacity-75">{run.terminalEvent ?? "running"}</span>
                </div>
                <div className="mt-2 h-2 rounded bg-white/50">
                  <div
                    className="h-2 rounded bg-current opacity-70"
                    style={{ width: `${Math.max(6, (run.eventCount / maxEvents) * 100)}%` }}
                  />
                </div>
              </button>
            ))
          ) : (
            <p className="rounded-md bg-slate-50 px-3 py-2 text-slate-500">暂无 Agent 运行数据。</p>
          )}
        </div>

        {selectedRun ? (
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <div className="font-medium text-slate-950">运行详情</div>
            <dl className="mt-3 space-y-2 text-slate-700">
              <Detail label="Run ID" value={selectedRun.runId} />
              <Detail label="事件数" value={String(selectedRun.eventCount)} />
              <Detail label="终态" value={selectedRun.terminalEvent ?? "运行中"} />
              <Detail label="开始" value={selectedRun.firstEventAt} />
              <Detail label="结束" value={selectedRun.lastEventAt} />
            </dl>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-950">{value}</div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words text-slate-950">{value}</dd>
    </div>
  );
}

function collapseJsonRenderEvents(events: AgentRunEvent[]): TimelineRow[] {
  const rows: TimelineRow[] = [];
  const streams = new Map<string, Extract<TimelineRow, { kind: "json-render" }>>();

  for (const event of events) {
    if (event.kind === "ui" && event.ui.component === "json-render") {
      const stream = streams.get(event.ui.id);

      if (stream) {
        stream.patches.push(event.ui);
      } else {
        const row = { id: event.ui.id, kind: "json-render" as const, patches: [event.ui], title: event.ui.title };
        streams.set(event.ui.id, row);
        rows.push(row);
      }

      continue;
    }

    rows.push({ event, kind: "event" });
  }

  return rows;
}
