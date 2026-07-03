"use client";

import { FormEvent, useState } from "react";
import { Button } from "@agent-template/ui";
import { submitAgentJob, type AgentJobAccepted } from "@/lib/agent-job-client";
import { AgentRunTimeline } from "./agent-run-timeline";

type AgentConsoleStatus = "idle" | "submitting" | "accepted" | "failed";

export function AgentConsole() {
  const [prompt, setPrompt] = useState("");
  const [acceptedJob, setAcceptedJob] = useState<AgentJobAccepted | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<AgentConsoleStatus>("idle");
  const submitting = status === "submitting";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setAcceptedJob(null);

    if (!prompt.trim()) {
      setError("请输入 Agent 请求。");
      setStatus("failed");
      return;
    }

    setStatus("submitting");
    try {
      setAcceptedJob(await submitAgentJob({ prompt }));
      setStatus("accepted");
    } catch (caught) {
      setError(getAgentJobErrorMessage(caught));
      setStatus("failed");
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium text-slate-700">Prompt</span>
        <textarea
          className="min-h-36 resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-950 shadow-sm outline-none transition focus:border-slate-400"
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="描述你希望 Agent 完成的工作"
          value={prompt}
        />
      </label>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button disabled={submitting} type="submit">
          {submitting ? "提交中..." : status === "failed" ? "重试提交" : "提交 Agent job"}
        </Button>
        <p aria-live="polite" className={status === "failed" ? "text-sm text-red-600" : "text-sm text-slate-500"}>
          {getStatusText(status, error)}
        </p>
      </div>

      {acceptedJob ? (
        <section className="rounded-md border border-slate-200 bg-white p-4">
          <p className="text-sm font-medium text-green-700">Agent job 已接受</p>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">Job ID</dt>
              <dd className="mt-1 break-words font-medium text-slate-950">{acceptedJob.id ?? "未返回"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Queue</dt>
              <dd className="mt-1 break-words font-medium text-slate-950">{acceptedJob.queue}</dd>
            </div>
          </dl>
        </section>
      ) : null}

      <AgentRunTimeline events={[]} />
    </form>
  );
}

function getStatusText(status: AgentConsoleStatus, error: string) {
  if (status === "submitting") {
    return "正在提交到 Agent job intake...";
  }

  if (status === "accepted") {
    return "后端已接受 Agent job。";
  }

  if (status === "failed") {
    return error;
  }

  return "准备提交新的 Agent job。";
}

function getAgentJobErrorMessage(caught: unknown) {
  if (!(caught instanceof Error)) {
    return "提交 Agent job 失败，请重试。";
  }

  if (caught.message.startsWith("Agent job intake rejected the request with status ")) {
    return `后端拒绝了 Agent job 请求（状态码 ${caught.message.split(" ").at(-1)}）。`;
  }

  if (caught.message === "Unable to reach Agent job intake API") {
    return "无法连接 Agent job intake API，请检查网络或后端服务。";
  }

  return caught.message;
}
