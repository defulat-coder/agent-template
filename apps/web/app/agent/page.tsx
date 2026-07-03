import { AgentConsole } from "@/features/frontend-agent/agent-console";

export default function AgentPage() {
  return (
    <main className="min-h-screen px-6 py-10">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
        <section className="border-b border-slate-200 pb-6">
          <p className="text-sm font-medium text-slate-500">Frontend Agent</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal text-slate-950">Agent 控制台</h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
            输入请求并提交到现有后端 Agent job intake。运行时选择和密钥仍由后端环境变量管理。
          </p>
        </section>

        <AgentConsole />
      </div>
    </main>
  );
}
