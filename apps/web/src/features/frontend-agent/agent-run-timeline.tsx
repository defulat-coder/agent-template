"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  CheckCircleIcon,
  CircleIcon,
  CircleNotchIcon,
  PaperPlaneTiltIcon,
} from "@phosphor-icons/react";
import { Button } from "@agent-template/ui";
import type {
  AgentInputRequest,
  AgentInputResponse,
  AgentRunEvent,
} from "@agent-template/shared";

type AgentRunTimelineProps = {
  events: AgentRunEvent[];
  pendingRequests: AgentInputRequest[];
  responding: boolean;
  runtimeLabel: string;
  onRespond: (responses: AgentInputResponse[], labels: string[]) => void;
};

export function AgentRunTimeline({
  events,
  pendingRequests,
  responding,
  runtimeLabel,
  onRespond,
}: AgentRunTimelineProps) {
  const activities = useMemo(() => buildActivities(events), [events]);

  return (
    <aside className="flex min-h-0 flex-col border-t border-[var(--agent-border)] bg-[var(--agent-canvas)] xl:border-t-0 xl:border-l">
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-7 xl:px-8">
        <div className="border-b border-[var(--agent-border-strong)] pb-4">
          <h2 className="text-lg font-semibold tracking-[-0.01em] text-[var(--agent-ink)]">
            Agent 正在推进
          </h2>
        </div>

        {activities.length ? (
          <ol className="mt-7">
            {activities.map((activity, index) => (
              <ActivityItem
                activity={activity}
                isLast={
                  index === activities.length - 1 && !pendingRequests.length
                }
                key={activity.id}
              />
            ))}
          </ol>
        ) : (
          <div className="mt-7 flex gap-4 text-sm text-[var(--agent-secondary)]">
            <CircleIcon className="mt-0.5 size-5 shrink-0" weight="regular" />
            <p className="leading-6">
              发送任务后，这里会显示 Agent 的 Tool 调用、进度和需要你处理的请求。
            </p>
          </div>
        )}

        {pendingRequests.length ? (
          <InputRequestGroup
            onRespond={onRespond}
            requests={pendingRequests}
            responding={responding}
          />
        ) : null}
      </div>

      <p className="border-t border-[var(--agent-border)] px-6 py-5 text-xs leading-5 text-[var(--agent-tertiary)] xl:px-8">
        所有活动由平台 API 驱动 · {runtimeLabel}
      </p>
    </aside>
  );
}

type Activity = {
  id: string;
  label: string;
  meta?: string;
  state: "completed" | "running" | "pending";
};

function ActivityItem({
  activity,
  isLast,
}: {
  activity: Activity;
  isLast: boolean;
}) {
  const icon =
    activity.state === "completed" ? (
      <CheckCircleIcon
        className="size-6 text-[var(--agent-success)]"
        weight="fill"
      />
    ) : activity.state === "running" ? (
      <CircleNotchIcon
        className="size-6 animate-spin text-[var(--agent-accent)]"
        weight="bold"
      />
    ) : (
      <CircleIcon
        className="size-6 text-[var(--agent-border-strong)]"
        weight="regular"
      />
    );

  return (
    <li className="agent-activity-item grid grid-cols-[24px_minmax(0,1fr)] gap-4">
      <div className="flex flex-col items-center">
        {icon}
        {!isLast ? (
          <span className="my-1 min-h-12 w-px flex-1 bg-[var(--agent-border-strong)]" />
        ) : null}
      </div>
      <div className="pb-7">
        <p
          className={
            activity.state === "pending"
              ? "font-medium text-[var(--agent-tertiary)]"
              : "font-medium text-[var(--agent-ink)]"
          }
        >
          {activity.label}
        </p>
        {activity.meta ? (
          <p className="mt-2 break-all font-mono text-xs leading-5 text-[var(--agent-tertiary)]">
            {activity.meta}
          </p>
        ) : null}
      </div>
    </li>
  );
}

function InputRequestGroup({
  onRespond,
  requests,
  responding,
}: {
  onRespond: (responses: AgentInputResponse[], labels: string[]) => void;
  requests: AgentInputRequest[];
  responding: boolean;
}) {
  const requestKey = requests.map((request) => request.requestId).join("|");
  const [responses, setResponses] = useState<
    Record<string, { response: AgentInputResponse; label: string }>
  >({});

  useEffect(() => setResponses({}), [requestKey]);

  function select(
    request: AgentInputRequest,
    response: AgentInputResponse,
    label: string,
  ) {
    if (requests.length === 1) {
      onRespond([response], [label]);
      return;
    }
    setResponses((current) => ({
      ...current,
      [request.requestId]: { response, label },
    }));
  }

  const complete = requests.every((request) => responses[request.requestId]);

  return (
    <div className="agent-activity-item ml-10 border-l-2 border-[var(--agent-accent)] bg-[var(--agent-paper)] px-5 py-5">
      <div className="flex flex-col gap-5">
        {requests.map((request) => (
          <InputRequestCard
            disabled={responding}
            key={request.requestId}
            onSelect={(response, label) => select(request, response, label)}
            request={request}
            selected={responses[request.requestId]?.response}
          />
        ))}
      </div>

      {requests.length > 1 ? (
        <Button
          className="agent-action mt-5 w-full bg-[var(--agent-accent)] text-white hover:bg-[var(--agent-accent-hover)]"
          disabled={!complete || responding}
          onClick={() =>
            onRespond(
              requests.map((request) => responses[request.requestId]!.response),
              requests.map((request) => responses[request.requestId]!.label),
            )
          }
          type="button"
        >
          <PaperPlaneTiltIcon className="size-4" weight="bold" />
          提交并继续
        </Button>
      ) : null}
    </div>
  );
}

function InputRequestCard({
  disabled,
  onSelect,
  request,
  selected,
}: {
  disabled: boolean;
  onSelect: (response: AgentInputResponse, label: string) => void;
  request: AgentInputRequest;
  selected?: AgentInputResponse;
}) {
  const [freeform, setFreeform] = useState("");

  function submitFreeform(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = freeform.trim();
    if (!text) return;
    onSelect({ requestId: request.requestId, text }, text);
  }

  return (
    <section aria-labelledby={`request-${request.requestId}`}>
      <p
        className="text-xs font-medium text-[var(--agent-accent)]"
        id={`request-${request.requestId}`}
      >
        需要确认
      </p>
      <h3 className="mt-2 text-base font-semibold leading-6 text-[var(--agent-ink)]">
        {request.prompt}
      </h3>
      {request.action ? (
        <p className="mt-2 font-mono text-xs leading-5 text-[var(--agent-tertiary)]">
          Tool: {formatToolName(request.action.toolName)}
        </p>
      ) : null}

      {request.options?.length ? (
        <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          {request.options.map((option) => {
            const active = selected?.optionId === option.id;
            const primary = option.style === "primary";
            return (
              <button
                aria-pressed={active}
                className={
                  primary
                    ? "agent-action min-h-11 rounded-lg bg-[var(--agent-accent)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--agent-accent-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--agent-accent)] disabled:opacity-50"
                    : "agent-action min-h-11 rounded-lg border border-[var(--agent-border-strong)] bg-[var(--agent-paper)] px-4 py-2.5 text-sm font-medium text-[var(--agent-ink)] hover:border-[var(--agent-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--agent-ink)] disabled:opacity-50"
                }
                disabled={disabled}
                key={option.id}
                onClick={() =>
                  onSelect(
                    { requestId: request.requestId, optionId: option.id },
                    option.label,
                  )
                }
                type="button"
              >
                {disabled && primary ? "正在继续…" : option.label}
              </button>
            );
          })}
        </div>
      ) : null}

      {request.allowFreeform && !request.options?.length ? (
        <form className="mt-4 flex gap-2" onSubmit={submitFreeform}>
          <input
            aria-label="输入回答"
            className="min-h-11 min-w-0 flex-1 rounded-lg border border-[var(--agent-border-strong)] bg-[var(--agent-canvas)] px-3 text-sm outline-none focus:border-[var(--agent-accent)]"
            disabled={disabled}
            onChange={(event) => setFreeform(event.target.value)}
            placeholder="输入你的回答"
            value={freeform}
          />
          <Button
            className="agent-action bg-[var(--agent-accent)] text-white hover:bg-[var(--agent-accent-hover)]"
            disabled={disabled || !freeform.trim()}
            type="submit"
          >
            继续
          </Button>
        </form>
      ) : null}
    </section>
  );
}

function buildActivities(events: AgentRunEvent[]): Activity[] {
  const results = new Set(
    events.flatMap((event) =>
      event.kind === "tool-result" ? [event.callId] : [],
    ),
  );
  const calls = events.flatMap((event) =>
    event.kind === "tool-call" ? [event] : [],
  );
  const activities: Activity[] = calls.map((event) => ({
    id: event.callId,
    label: describeToolCall(event.toolName),
    meta: `Tool: ${formatToolName(event.toolName)}`,
    state: results.has(event.callId) ? "completed" : "running",
  }));
  const terminal = [...events]
    .reverse()
    .find(
      (event) =>
        event.kind === "done" ||
        event.kind === "error" ||
        event.kind === "cancelled",
    );
  if (terminal?.kind === "done") {
    activities.push({
      id: `done-${activities.length}`,
      label: "交付物已更新",
      state: "completed",
    });
  }
  if (terminal?.kind === "error") {
    activities.push({
      id: `error-${activities.length}`,
      label: "运行失败",
      meta: terminal.message,
      state: "pending",
    });
  }
  if (terminal?.kind === "cancelled") {
    activities.push({
      id: `cancelled-${activities.length}`,
      label: "运行已取消",
      meta: terminal.reason,
      state: "pending",
    });
  }
  return activities;
}

function describeToolCall(toolName: string) {
  if (toolName.includes("subagent")) return "委派子 Agent 处理任务";
  if (toolName === "AskUserQuestion") return "确认分析范围";
  return `调用 ${formatToolName(toolName)}`;
}

function formatToolName(toolName: string) {
  return toolName
    .replace(/^mcp__toolbox__/, "")
    .replace(/^toolbox__/, "")
    .replace(/^eve:subagent:/, "subagent:")
    .replaceAll("_", " ")
    .replaceAll("-", " ");
}
