import { Button } from "@agent-template/ui";
import { fetchHealth } from "@/lib/health";
import { stackItems } from "@/lib/stack";

export default async function Home() {
  const health = await fetchHealth();

  return (
    <main className="min-h-screen px-6 py-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <section className="flex flex-col gap-4 border-b border-slate-200 pb-8">
          <p className="text-sm font-medium text-slate-500">Agent Platform Template</p>
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-4xl font-semibold tracking-normal text-slate-950">项目模板已就绪</h1>
              <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
                Next.js、Fastify、BullMQ、Prisma、Redis、Claude Agent runtime 和 Eve Agent runtime 已按 monorepo 结构拆分。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <a href="/agent">打开 Agent 控制台</a>
              </Button>
              <Button asChild>
                <a href="http://localhost:4000/health">查看 API Health</a>
              </Button>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <StatusPanel
            title="API"
            value={health.ok ? health.data.status : "offline"}
            detail={health.ok ? health.data.timestamp : health.error}
          />
          <StatusPanel
            title="PostgreSQL"
            value={health.ok ? health.data.database.status : "unknown"}
            detail={health.ok ? health.data.database.message : "等待 API 响应"}
          />
          <StatusPanel
            title="Redis / BullMQ"
            value={health.ok ? health.data.queue.status : "unknown"}
            detail={health.ok ? health.data.redis.message : "等待 API 响应"}
          />
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-slate-950">技术栈</h2>
          <div className="flex flex-wrap gap-2">
            {stackItems.map((item) => (
              <span key={item} className="rounded-md border border-slate-200 bg-white px-3 py-1 text-sm text-slate-700">
                {item}
              </span>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function StatusPanel({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <div className="text-sm font-medium text-slate-500">{title}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-950">{value}</div>
      <p className="mt-2 break-words text-sm leading-6 text-slate-600">{detail}</p>
    </div>
  );
}
