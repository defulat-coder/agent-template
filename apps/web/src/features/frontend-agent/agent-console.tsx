"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  CircleAlert,
  Copy,
  Send,
  Square,
} from "lucide-react";
import { Alert, AlertDescription } from "@agent-template/ui/components/alert";
import { Badge } from "@agent-template/ui/components/badge";
import { Button } from "@agent-template/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@agent-template/ui/components/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@agent-template/ui/components/empty";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@agent-template/ui/components/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@agent-template/ui/components/input-group";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@agent-template/ui/components/tabs";
import type {
  AgentArtifact,
  AgentInputResponse,
  AgentRunEvent,
  AgentRunResult,
} from "@agent-template/shared";
import { cancelAgentRun, streamAgentChat } from "@/lib/agent-client";
import { AgentMarkdown } from "./agent-markdown";
import { appendAgentEventHistory } from "./event-history";
import { AgentRunTimeline } from "./agent-run-timeline";

type AgentConsoleStatus =
  | "idle"
  | "submitting"
  | "running"
  | "waiting"
  | "completed"
  | "cancelled"
  | "skipped"
  | "failed";

export function AgentConsole() {
  const [prompt, setPrompt] = useState("");
  const [events, setEvents] = useState<AgentRunEvent[]>([]);
  const [conversationId, setConversationId] = useState<string>();
  const [activeRunId, setActiveRunId] = useState<string>();
  const [runtimeLabel, setRuntimeLabel] = useState("平台 Runtime");
  const [streamedOutput, setStreamedOutput] = useState("");
  const [error, setError] = useState("");
  const [taskTitle, setTaskTitle] = useState("开始一项新的 Agent 工作");
  const [status, setStatus] = useState<AgentConsoleStatus>("idle");
  const [responding, setResponding] = useState(false);
  const [answeredRequestIds, setAnsweredRequestIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [headerTime, setHeaderTime] = useState("");
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setHeaderTime(
      new Intl.DateTimeFormat("zh-CN", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date()),
    );
  }, []);

  useEffect(
    () => () => {
      abortControllerRef.current?.abort("Agent workspace unmounted");
    },
    [],
  );

  const busy = status === "submitting" || status === "running" || responding;
  const pendingRequests = useMemo(
    () =>
      events.flatMap((event) =>
        event.kind === "input-request" &&
        !answeredRequestIds.has(event.request.requestId)
          ? [event.request]
          : [],
      ),
    [answeredRequestIds, events],
  );
  const artifacts = useMemo(
    () => buildArtifactTabs(events, streamedOutput),
    [events, streamedOutput],
  );

  async function executeRun(input: {
    prompt: string;
    inputResponses?: AgentInputResponse[];
    resetWorkspace?: boolean;
  }) {
    const trimmedPrompt = input.prompt.trim();
    if (!trimmedPrompt) {
      setError("请输入 Agent 请求。");
      setStatus("failed");
      return false;
    }

    setError("");
    setRuntimeLabel("平台 Runtime");
    if (input.resetWorkspace) {
      setEvents([]);
      setStreamedOutput("");
      setAnsweredRequestIds(new Set());
    }
    setStatus("submitting");
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const chatResult = await streamAgentChat({
        ...(conversationId ? { conversationId } : {}),
        ...(input.inputResponses
          ? { inputResponses: input.inputResponses }
          : {}),
        prompt: trimmedPrompt,
        signal: abortController.signal,
        onAccepted(frame) {
          setActiveRunId(frame.runId);
          if (frame.conversationId) setConversationId(frame.conversationId);
          setStatus("running");
        },
        onEvent(event) {
          setEvents((current) => appendAgentEventHistory(current, event));
          if (event.kind === "text") setStreamedOutput(event.text);
          if (event.kind === "done") setStreamedOutput(event.result);
        },
      });

      setRuntimeLabel(formatRuntime(chatResult));
      if (chatResult.conversationId) {
        setConversationId(chatResult.conversationId);
      }
      const output = getAgentRunResultText(chatResult);
      if (output) setStreamedOutput(output);
      setStatus(chatResult.status);
      return (
        chatResult.status === "completed" || chatResult.status === "waiting"
      );
    } catch (caught) {
      const message = getAgentChatErrorMessage(caught);
      setError(message);
      setStatus(message === "Agent run 已取消。" ? "cancelled" : "failed");
      return false;
    } finally {
      abortControllerRef.current = null;
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextPrompt = prompt.trim();
    if (nextPrompt) setTaskTitle(toTaskTitle(nextPrompt));
    const succeeded = await executeRun({
      prompt: nextPrompt,
      resetWorkspace: !conversationId,
    });
    if (succeeded) setPrompt("");
  }

  async function handleRespond(
    responses: AgentInputResponse[],
    labels: string[],
  ) {
    setResponding(true);
    const succeeded = await executeRun({
      prompt: labels.join("；"),
      inputResponses: responses,
    });
    if (succeeded) {
      setAnsweredRequestIds((current) => {
        const next = new Set(current);
        for (const response of responses) next.add(response.requestId);
        return next;
      });
    }
    setResponding(false);
  }

  async function handleCancel() {
    const runId = activeRunId;
    try {
      if (runId) {
        await cancelAgentRun(runId, { baseUrl: "/api" });
      }
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "取消 Agent run 失败。",
      );
    } finally {
      abortControllerRef.current?.abort();
      setStatus("cancelled");
    }
  }

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b bg-background">
        <div className="grid min-h-16 grid-cols-1 items-center gap-3 px-5 py-3 md:grid-cols-[minmax(160px,0.7fr)_minmax(280px,1.8fr)_auto] md:px-8 xl:px-10">
          <Button asChild className="w-fit" variant="ghost">
            <Link href="/">
              <ArrowLeft data-icon="inline-start" />
              全部工作
            </Link>
          </Button>

          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <h1 className="truncate text-balance text-lg font-semibold">
              {taskTitle}
            </h1>
            <StatusBadge status={status} />
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground md:justify-end">
            <span>{runtimeLabel}</span>
            {headerTime ? <span aria-hidden="true">·</span> : null}
            <time suppressHydrationWarning>{headerTime}</time>
          </div>
        </div>
      </header>

      <div className="grid min-h-[calc(100dvh-4rem)] grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="flex min-h-0 flex-col gap-4 p-4 sm:p-6 lg:p-8 xl:p-5">
          <ArtifactWorkspace
            artifacts={artifacts}
            conversationId={conversationId}
            status={status}
            taskTitle={taskTitle}
          />

          <Card>
            <CardHeader>
              <CardTitle>继续任务</CardTitle>
              <CardDescription>
                输入新任务，或基于当前 Conversation 调整结果。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
                <FieldGroup>
                  <Field
                    data-disabled={busy || status === "waiting"}
                    data-invalid={Boolean(error)}
                  >
                    <FieldLabel htmlFor="agent-prompt">
                      给 Agent 的要求
                    </FieldLabel>
                    <InputGroup>
                      <InputGroupTextarea
                        aria-invalid={Boolean(error)}
                        className="max-h-36 min-h-20 resize-none"
                        disabled={busy || status === "waiting"}
                        id="agent-prompt"
                        onChange={(event) => setPrompt(event.target.value)}
                        onKeyDown={(event) => {
                          if (
                            event.key === "Enter" &&
                            !event.shiftKey &&
                            !event.nativeEvent.isComposing
                          ) {
                            event.preventDefault();
                            event.currentTarget.form?.requestSubmit();
                          }
                        }}
                        placeholder={
                          status === "idle"
                            ? "描述你希望 Agent 完成并交付的结果…"
                            : status === "waiting"
                              ? "请先处理右侧的确认请求"
                              : "让 Agent 调整这份结果…"
                        }
                        rows={2}
                        value={prompt}
                      />
                      <InputGroupAddon align="block-end">
                        <div className="ml-auto flex gap-2">
                          {status === "running" || status === "submitting" ? (
                            <InputGroupButton
                              aria-label="取消 Agent run"
                              onClick={handleCancel}
                              size="icon-sm"
                              type="button"
                              variant="outline"
                            >
                              <Square data-icon="inline-start" />
                            </InputGroupButton>
                          ) : null}
                          <InputGroupButton
                            aria-label="发送给 Agent"
                            disabled={
                              busy || status === "waiting" || !prompt.trim()
                            }
                            size="icon-sm"
                            type="submit"
                            variant="default"
                          >
                            <Send data-icon="inline-start" />
                          </InputGroupButton>
                        </div>
                      </InputGroupAddon>
                    </InputGroup>
                    <FieldDescription>
                      按 Enter 发送，Shift + Enter 换行。
                    </FieldDescription>
                  </Field>
                </FieldGroup>

                {error ? (
                  <Alert variant="destructive">
                    <CircleAlert />
                    <AlertDescription aria-live="polite">
                      {error}
                    </AlertDescription>
                  </Alert>
                ) : null}
              </form>
            </CardContent>
          </Card>
        </section>

        <AgentRunTimeline
          events={events}
          onRespond={handleRespond}
          pendingRequests={pendingRequests}
          responding={responding}
          runtimeLabel={runtimeLabel}
        />
      </div>
    </main>
  );
}

function ArtifactWorkspace({
  artifacts,
  conversationId,
  status,
  taskTitle,
}: {
  artifacts: AgentArtifact[];
  conversationId?: string;
  status: AgentConsoleStatus;
  taskTitle: string;
}) {
  const tabKey = artifacts.map((artifact) => artifact.id).join("|");
  const [activeId, setActiveId] = useState(artifacts[0]?.id ?? "");
  const [copied, setCopied] = useState(false);
  const copiedTimeoutRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!artifacts.some((artifact) => artifact.id === activeId)) {
      setActiveId(artifacts[0]?.id ?? "");
    }
  }, [activeId, artifacts, tabKey]);

  useEffect(
    () => () => {
      if (copiedTimeoutRef.current !== undefined) {
        window.clearTimeout(copiedTimeoutRef.current);
      }
    },
    [],
  );

  const active =
    artifacts.find((artifact) => artifact.id === activeId) ?? artifacts[0];

  async function copyArtifact() {
    if (!active) return;
    await navigator.clipboard?.writeText(active.content);
    setCopied(true);
    if (copiedTimeoutRef.current !== undefined) {
      window.clearTimeout(copiedTimeoutRef.current);
    }
    copiedTimeoutRef.current = window.setTimeout(() => {
      copiedTimeoutRef.current = undefined;
      setCopied(false);
    }, 1400);
  }

  return (
    <Card className="min-h-[620px] flex-1">
      <CardHeader>
        <CardTitle>{active?.label ?? "Agent 交付物"}</CardTitle>
        <CardDescription className="truncate">
          {conversationId
            ? `Conversation ${conversationId.slice(0, 8)} · ${taskTitle}`
            : "任务完成后，结果和 Artifact 会保留在这里"}
        </CardDescription>
        {active ? (
          <CardAction>
            <Button onClick={copyArtifact} size="sm" variant="outline">
              {copied ? (
                <Check data-icon="inline-start" />
              ) : (
                <Copy data-icon="inline-start" />
              )}
              {copied ? "已复制" : "复制"}
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col">
        {artifacts.length ? (
          <Tabs
            className="min-h-0 flex-1"
            onValueChange={setActiveId}
            value={active?.id}
          >
            <TabsList className="max-w-full overflow-x-auto" variant="line">
              {artifacts.map((artifact) => (
                <TabsTrigger key={artifact.id} value={artifact.id}>
                  {artifact.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {artifacts.map((artifact) => (
              <TabsContent
                className="min-h-0 flex-1 overflow-y-auto py-4"
                key={artifact.id}
                value={artifact.id}
              >
                <div className="max-w-5xl text-pretty text-sm leading-7">
                  <AgentMarkdown>{artifact.content}</AgentMarkdown>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        ) : (
          <EmptyArtifact status={status} />
        )}
      </CardContent>
    </Card>
  );
}

function EmptyArtifact({ status }: { status: AgentConsoleStatus }) {
  return (
    <Empty className="min-h-96 border">
      <EmptyHeader>
        <Badge variant="outline">
          {status === "running" || status === "submitting"
            ? "正在生成"
            : "新的工作空间"}
        </Badge>
        <EmptyTitle>交付物，而不只是一段聊天记录</EmptyTitle>
        <EmptyDescription>
          Agent 的输出、表格、行动清单和其他 Artifact 会在同一个 Conversation
          中持续更新。
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button asChild variant="outline">
          <a href="#agent-prompt">输入任务</a>
        </Button>
      </EmptyContent>
    </Empty>
  );
}

function StatusBadge({ status }: { status: AgentConsoleStatus }) {
  const text = {
    idle: "准备开始",
    submitting: "正在连接",
    running: "正在推进",
    waiting: "等待你的确认",
    completed: "已交付",
    cancelled: "已取消",
    skipped: "Runtime 未配置",
    failed: "运行失败",
  }[status];
  const variant =
    status === "failed"
      ? "destructive"
      : status === "running" || status === "submitting"
        ? "secondary"
        : "outline";

  return (
    <Badge aria-live="polite" variant={variant}>
      {text}
    </Badge>
  );
}

function buildArtifactTabs(events: AgentRunEvent[], output: string) {
  const artifactEvent = [...events]
    .reverse()
    .find((event) => event.kind === "artifacts");
  if (artifactEvent?.kind === "artifacts" && artifactEvent.tabs.length) {
    return artifactEvent.tabs;
  }
  if (!output.trim()) return [];
  return [
    {
      id: "agent-output",
      label: "分析报告",
      hint: "Markdown",
      content: output,
    },
  ];
}

function getAgentRunResultText(result: AgentRunResult) {
  return result.status === "completed" ? result.output : "";
}

function toTaskTitle(prompt: string) {
  return prompt.length > 36 ? `${prompt.slice(0, 33)}…` : prompt;
}

function formatRuntime(result: AgentRunResult) {
  return `${result.runtime === "claude" ? "Claude Code" : "Eve"} · ${result.model}`;
}

function getAgentChatErrorMessage(caught: unknown) {
  if (!(caught instanceof Error)) return "启动 Agent run 失败，请重试。";
  if (
    caught.message.startsWith("Agent chat rejected the request with status ")
  ) {
    return `后端拒绝了 Agent 请求（状态码 ${caught.message.split(" ").at(-1)}）。`;
  }
  if (caught.message === "Unable to reach Agent chat API") {
    return "无法连接 Agent API，请检查网络或后端服务。";
  }
  if (caught.message === "Agent chat cancelled") return "Agent run 已取消。";
  return caught.message;
}
