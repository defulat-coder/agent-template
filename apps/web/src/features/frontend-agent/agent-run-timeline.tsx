"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Circle, CircleCheck, Send } from "lucide-react";
import { Badge } from "@agent-template/ui/components/badge";
import { Button } from "@agent-template/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@agent-template/ui/components/card";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@agent-template/ui/components/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@agent-template/ui/components/input-group";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@agent-template/ui/components/empty";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "@agent-template/ui/components/item";
import { Spinner } from "@agent-template/ui/components/spinner";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@agent-template/ui/components/toggle-group";
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
    <aside className="border-t p-4 xl:border-l xl:border-t-0">
      <Card>
        <CardHeader>
          <CardTitle>Agent 正在推进</CardTitle>
          <CardDescription>
            Tool 调用、运行进度和待确认请求会显示在这里。
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-6">
          {activities.length ? (
            <ItemGroup>
              {activities.map((activity, index) => (
                <div key={activity.id}>
                  {index ? <ItemSeparator /> : null}
                  <ActivityItem activity={activity} />
                </div>
              ))}
            </ItemGroup>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Circle />
                </EmptyMedia>
                <EmptyTitle>等待任务</EmptyTitle>
                <EmptyDescription>
                  发送任务后，这里会显示 Agent 的运行活动。
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}

          {pendingRequests.length ? (
            <InputRequestGroup
              onRespond={onRespond}
              requests={pendingRequests}
              responding={responding}
            />
          ) : null}
        </CardContent>

        <CardFooter className="border-t">
          <p className="text-pretty text-xs leading-5 text-muted-foreground">
            所有活动由平台 API 驱动 · {runtimeLabel}
          </p>
        </CardFooter>
      </Card>
    </aside>
  );
}

type Activity = {
  id: string;
  label: string;
  meta?: string;
  state: "completed" | "running" | "pending";
};

function ActivityItem({ activity }: { activity: Activity }) {
  const icon =
    activity.state === "completed" ? (
      <CircleCheck aria-label="已完成" />
    ) : activity.state === "running" ? (
      <Spinner aria-label="正在运行" />
    ) : (
      <Circle aria-label="待处理" />
    );

  return (
    <Item size="sm">
      <ItemMedia variant="icon">{icon}</ItemMedia>
      <ItemContent>
        <ItemTitle>{activity.label}</ItemTitle>
        {activity.meta ? (
          <ItemDescription className="line-clamp-none break-all">
            <code>{activity.meta}</code>
          </ItemDescription>
        ) : null}
      </ItemContent>
    </Item>
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
    <div className="flex flex-col gap-4">
      {requests.map((request) => (
        <InputRequestCard
          disabled={responding}
          key={request.requestId}
          onSelect={(response, label) => select(request, response, label)}
          request={request}
          selected={responses[request.requestId]?.response}
        />
      ))}

      {requests.length > 1 ? (
        <Button
          className="w-full"
          disabled={!complete || responding}
          onClick={() =>
            onRespond(
              requests.map((request) => responses[request.requestId]!.response),
              requests.map((request) => responses[request.requestId]!.label),
            )
          }
          type="button"
        >
          {responding ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <Send data-icon="inline-start" />
          )}
          {responding ? "正在继续…" : "提交并继续"}
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
    <Card>
      <CardHeader>
        <Badge variant="outline">需要确认</Badge>
        <CardTitle id={`request-${request.requestId}`}>
          {request.prompt}
        </CardTitle>
        {request.action ? (
          <CardDescription>
            <code>Tool: {formatToolName(request.action.toolName)}</code>
          </CardDescription>
        ) : null}
      </CardHeader>
      <CardContent>
        {request.options?.length ? (
          <FieldSet>
            <FieldLegend className="sr-only">选择一个回答</FieldLegend>
            <FieldGroup>
              <Field data-disabled={disabled}>
                <ToggleGroup
                  aria-labelledby={`request-${request.requestId}`}
                  className="grid w-full grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2"
                  disabled={disabled}
                  onValueChange={(optionId) => {
                    if (!optionId) return;
                    const option = request.options?.find(
                      (candidate) => candidate.id === optionId,
                    );
                    if (!option) return;
                    onSelect(
                      { requestId: request.requestId, optionId },
                      option.label,
                    );
                  }}
                  spacing={2}
                  type="single"
                  value={selected?.optionId ?? ""}
                  variant="outline"
                >
                  {request.options.map((option) => (
                    <ToggleGroupItem
                      className="h-auto min-h-9 whitespace-normal"
                      key={option.id}
                      value={option.id}
                    >
                      {option.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </Field>
            </FieldGroup>
          </FieldSet>
        ) : null}

        {request.allowFreeform && !request.options?.length ? (
          <form onSubmit={submitFreeform}>
            <FieldGroup>
              <Field data-disabled={disabled}>
                <FieldLabel className="sr-only" htmlFor={request.requestId}>
                  输入回答
                </FieldLabel>
                <InputGroup>
                  <InputGroupInput
                    disabled={disabled}
                    id={request.requestId}
                    onChange={(event) => setFreeform(event.target.value)}
                    placeholder="输入你的回答"
                    value={freeform}
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      disabled={disabled || !freeform.trim()}
                      type="submit"
                      variant="default"
                    >
                      继续
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
              </Field>
            </FieldGroup>
          </form>
        ) : null}
      </CardContent>
    </Card>
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
