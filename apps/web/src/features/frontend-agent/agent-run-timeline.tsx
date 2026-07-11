"use client";

import { useState } from "react";
import type { AgentArtifact, AgentRunEvent } from "@agent-template/shared";

export function AgentRunTimeline({ events }: { events: AgentRunEvent[] }) {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-slate-950">运行事件</h2>
        <p className="text-sm text-slate-500">
          来自当前 Agent Chat SSE 连接的运行事件。
        </p>
      </div>

      {events.length ? (
        <div className="mt-4 flex flex-col gap-3">
          {events.map((event, index) => (
            <AgentRunEventRow event={event} key={`${event.kind}-${index}`} />
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-500">
          暂无运行事件。
        </p>
      )}
    </section>
  );
}

function AgentRunEventRow({ event }: { event: AgentRunEvent }) {
  if (event.kind === "tool-call") {
    return (
      <LogRow
        label={`Tool call: ${event.toolName} (${event.callId})`}
        tone="blue"
      >
        {JSON.stringify(event.input, null, 2)}
      </LogRow>
    );
  }

  if (event.kind === "tool-result") {
    return (
      <LogRow
        label={`Tool result: ${event.toolName} (${event.callId})`}
        tone="green"
      />
    );
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

  if (event.kind === "cancelled") {
    return (
      <LogRow label="运行已取消" tone="slate">
        {event.reason}
      </LogRow>
    );
  }

  if (event.kind === "artifacts") {
    return <ArtifactTabs tabs={event.tabs} />;
  }

  return <LogRow label="Unknown event">{event.text}</LogRow>;
}

function LogRow({
  children,
  label,
  tone = "slate",
}: {
  children?: string;
  label: string;
  tone?: "blue" | "green" | "red" | "slate";
}) {
  const toneClass = {
    blue: "border-blue-200 bg-blue-50 text-blue-900",
    green: "border-green-200 bg-green-50 text-green-900",
    red: "border-red-200 bg-red-50 text-red-900",
    slate: "border-slate-200 bg-slate-50 text-slate-900",
  }[tone];

  return (
    <div className={`rounded-md border px-3 py-2 text-sm ${toneClass}`}>
      <div className="font-medium">{label}</div>
      {children ? (
        <pre className="mt-2 whitespace-pre-wrap break-words font-sans leading-6">
          {children}
        </pre>
      ) : null}
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
      <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words text-slate-900">
        {active.content}
      </pre>
    </div>
  );
}
