import Link from "next/link";
import { Badge } from "@agent-template/ui/components/badge";
import { Button } from "@agent-template/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@agent-template/ui/components/card";
import { Separator } from "@agent-template/ui/components/separator";
import { fetchHealth } from "@/lib/health";
import { stackItems } from "@/lib/stack";

export default async function Home() {
  const health = await fetchHealth();

  return (
    <main className="min-h-dvh px-6 py-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <section className="flex flex-col gap-4">
          <Badge className="w-fit" variant="outline">
            Agent Platform Template
          </Badge>
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="flex max-w-2xl flex-col gap-3">
              <h1 className="text-balance text-4xl font-semibold">
                项目模板已就绪
              </h1>
              <p className="text-pretty leading-7 text-muted-foreground">
                Next.js、Fastify、BullMQ、Prisma、Redis、Claude Agent runtime 和
                Eve Agent runtime 已按 monorepo 结构拆分。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href="/agent">打开 Agent 控制台</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/docs">查看项目文档</Link>
              </Button>
              <Button asChild variant="outline">
                <a href="http://localhost:14000/health">查看 API Health</a>
              </Button>
            </div>
          </div>
        </section>

        <Separator />

        <section className="grid gap-4 md:grid-cols-3">
          <StatusCard
            title="API"
            value={health.ok ? health.data.status : "offline"}
            detail={health.ok ? health.data.timestamp : health.error}
          />
          <StatusCard
            title="PostgreSQL"
            value={health.ok ? health.data.database.status : "unknown"}
            detail={health.ok ? health.data.database.message : "等待 API 响应"}
          />
          <StatusCard
            title="Redis / BullMQ"
            value={health.ok ? health.data.queue.status : "unknown"}
            detail={health.ok ? health.data.redis.message : "等待 API 响应"}
          />
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-balance text-lg font-semibold">技术栈</h2>
          <div className="flex flex-wrap gap-2">
            {stackItems.map((item) => (
              <Badge key={item} variant="secondary">
                {item}
              </Badge>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function StatusCard({
  title,
  value,
  detail,
}: {
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className="tabular-nums">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="break-words text-pretty text-sm leading-6 text-muted-foreground">
          {detail}
        </p>
      </CardContent>
    </Card>
  );
}
