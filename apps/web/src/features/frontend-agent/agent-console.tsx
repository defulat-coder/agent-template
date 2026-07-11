"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeftIcon,
  CheckIcon,
  CopyIcon,
  PaperPlaneTiltIcon,
  StopCircleIcon,
} from "@phosphor-icons/react";
import { Button } from "@agent-template/ui";
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
    <main className="min-h-screen bg-[var(--agent-canvas)] text-[var(--agent-ink)]">
      <header className="sticky top-0 z-20 border-b border-[var(--agent-border)] bg-[color-mix(in_srgb,var(--agent-canvas)_94%,transparent)] backdrop-blur-sm">
        <div className="grid min-h-16 grid-cols-1 items-center gap-3 px-5 py-3 md:grid-cols-[minmax(160px,0.7fr)_minmax(280px,1.8fr)_auto] md:px-8 xl:px-10">
          <Link
            className="agent-action inline-flex min-h-10 w-fit items-center gap-2 rounded-lg px-1 text-sm font-medium hover:text-[var(--agent-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--agent-accent)]"
            href="/"
          >
            <ArrowLeftIcon className="size-5" weight="bold" />
            全部工作
          </Link>

          <div className="min-w-0 md:flex md:items-center md:gap-6">
            <h1 className="truncate text-lg font-semibold tracking-[-0.01em]">
              {taskTitle}
            </h1>
            <StatusLabel status={status} />
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--agent-secondary)] md:justify-end">
            <span>{runtimeLabel}</span>
            {headerTime ? <span aria-hidden="true">·</span> : null}
            <time suppressHydrationWarning>{headerTime}</time>
          </div>
        </div>
      </header>

      <div className="grid min-h-[calc(100vh-65px)] grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="flex min-h-0 flex-col px-4 py-5 sm:px-6 lg:px-8 xl:px-5 xl:py-5">
          <ArtifactWorkspace
            artifacts={artifacts}
            conversationId={conversationId}
            status={status}
            taskTitle={taskTitle}
          />

          <form
            className="mt-4 flex min-h-18 items-end gap-3 rounded-lg border border-[var(--agent-border)] bg-[var(--agent-paper)] p-3 focus-within:border-[var(--agent-border-strong)]"
            onSubmit={handleSubmit}
          >
            <label className="min-w-0 flex-1">
              <span className="sr-only">继续向 Agent 提出要求</span>
              <textarea
                className="max-h-36 min-h-11 w-full resize-none bg-transparent px-2 py-2 text-sm leading-6 outline-none placeholder:text-[var(--agent-tertiary)]"
                disabled={busy || status === "waiting"}
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
                rows={1}
                value={prompt}
              />
            </label>

            <div className="flex shrink-0 items-center gap-2">
              {status === "running" || status === "submitting" ? (
                <button
                  className="agent-action inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm text-[var(--agent-secondary)] hover:bg-[var(--agent-canvas)] hover:text-[var(--agent-danger)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--agent-danger)]"
                  onClick={handleCancel}
                  type="button"
                >
                  <StopCircleIcon className="size-5" weight="bold" />
                  <span className="hidden sm:inline">取消</span>
                </button>
              ) : null}
              <Button
                aria-label="发送给 Agent"
                className="agent-action size-11 rounded-lg bg-[var(--agent-accent)] p-0 text-white hover:bg-[var(--agent-accent-hover)]"
                disabled={busy || status === "waiting" || !prompt.trim()}
                type="submit"
              >
                <PaperPlaneTiltIcon className="size-5" weight="bold" />
              </Button>
            </div>
          </form>

          {error ? (
            <p
              aria-live="polite"
              className="mt-3 text-sm text-[var(--agent-danger)]"
            >
              {error}
            </p>
          ) : null}
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
    <article className="flex min-h-[620px] flex-1 flex-col overflow-hidden rounded-lg border border-[var(--agent-border)] bg-[var(--agent-paper)]">
      <div className="flex flex-col gap-4 border-b border-[var(--agent-border)] px-6 py-6 sm:flex-row sm:items-start sm:justify-between lg:px-7">
        <div className="min-w-0">
          <h2 className="text-[28px] font-semibold leading-9 tracking-[-0.025em] text-[var(--agent-ink)]">
            {active?.label ?? "Agent 交付物"}
          </h2>
          <p className="mt-2 truncate text-sm text-[var(--agent-tertiary)]">
            {conversationId
              ? `Conversation ${conversationId.slice(0, 8)} · ${taskTitle}`
              : "任务完成后，结果和 Artifact 会保留在这里"}
          </p>
        </div>
        {active ? (
          <button
            className="agent-action inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-sm text-[var(--agent-secondary)] hover:bg-[var(--agent-canvas)] hover:text-[var(--agent-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--agent-ink)]"
            onClick={copyArtifact}
            type="button"
          >
            {copied ? (
              <CheckIcon className="size-4" weight="bold" />
            ) : (
              <CopyIcon className="size-4" weight="regular" />
            )}
            {copied ? "已复制" : "复制"}
          </button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-7 lg:px-7">
        {active?.content ? (
          <div className="max-w-5xl text-[15px] leading-7 text-[var(--agent-ink)] [&>*+*]:mt-4">
            <AgentMarkdown>{active.content}</AgentMarkdown>
          </div>
        ) : (
          <EmptyArtifact status={status} />
        )}
      </div>

      {artifacts.length ? (
        <nav
          aria-label="交付物"
          className="flex min-h-13 overflow-x-auto border-t border-[var(--agent-border)]"
        >
          {artifacts.map((artifact) => (
            <button
              aria-current={artifact.id === active?.id ? "page" : undefined}
              className={
                artifact.id === active?.id
                  ? "agent-action min-w-36 border-b-2 border-[var(--agent-accent)] px-6 text-sm font-medium text-[var(--agent-ink)]"
                  : "agent-action min-w-36 border-b-2 border-transparent px-6 text-sm text-[var(--agent-secondary)] hover:bg-[var(--agent-canvas)] hover:text-[var(--agent-ink)]"
              }
              key={artifact.id}
              onClick={() => setActiveId(artifact.id)}
              type="button"
            >
              {artifact.label}
            </button>
          ))}
        </nav>
      ) : null}
    </article>
  );
}

function EmptyArtifact({ status }: { status: AgentConsoleStatus }) {
  return (
    <div className="flex min-h-96 max-w-2xl flex-col justify-center">
      <p className="text-xs font-medium text-[var(--agent-accent)]">
        {status === "running" || status === "submitting"
          ? "正在生成"
          : "新的工作空间"}
      </p>
      <h3 className="mt-3 text-3xl font-semibold tracking-[-0.025em]">
        交付物，而不只是一段聊天记录
      </h3>
      <p className="mt-4 max-w-xl text-base leading-7 text-[var(--agent-secondary)]">
        在下方描述你希望完成的结果。Agent 的输出、表格、行动清单和其他 Artifact
        会在同一个 Conversation 中持续更新。
      </p>
    </div>
  );
}

function StatusLabel({ status }: { status: AgentConsoleStatus }) {
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
  const active = status === "running" || status === "submitting";
  const attention = status === "waiting" || status === "failed";

  return (
    <span
      aria-live="polite"
      className={
        attention
          ? "mt-1 inline-flex items-center gap-2 text-sm font-medium text-[var(--agent-accent)] md:mt-0"
          : "mt-1 inline-flex items-center gap-2 text-sm text-[var(--agent-secondary)] md:mt-0"
      }
    >
      <span
        className={
          active
            ? "size-2 animate-pulse rounded-full bg-[var(--agent-success)]"
            : attention
              ? "size-2 rounded-full bg-[var(--agent-accent)]"
              : "size-2 rounded-full bg-[var(--agent-border-strong)]"
        }
      />
      {text}
    </span>
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
