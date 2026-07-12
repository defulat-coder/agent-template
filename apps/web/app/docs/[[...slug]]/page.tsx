import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { Badge } from "@agent-template/ui/components/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@agent-template/ui/components/breadcrumb";
import { Button } from "@agent-template/ui/components/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@agent-template/ui/components/collapsible";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@agent-template/ui/components/card";
import { Separator } from "@agent-template/ui/components/separator";
import { DocsMarkdown } from "@/features/docs/docs-markdown";
import {
  listZReadDocuments,
  readZReadDocument,
  type ZReadCatalogEntry,
} from "@/lib/zread-catalog";
import { findZReadWikiRoot } from "@/lib/zread-root";
import { listZReadSourcePaths } from "@/lib/zread-sources";

type DocsPageProps = {
  params: Promise<{ slug?: string[] }>;
};

export const dynamicParams = false;

export async function generateStaticParams() {
  const catalog = await listZReadDocuments(await findZReadWikiRoot());
  return catalog.map((entry) => ({ slug: entry.slug }));
}

export async function generateMetadata({
  params,
}: DocsPageProps): Promise<Metadata> {
  const { slug = [] } = await params;
  const document = await readZReadDocument(await findZReadWikiRoot(), slug);

  return document
    ? {
        title: `${document.title} · Agent Template 文档`,
        description: `Agent Template 项目文档：${document.title}`,
      }
    : { title: "文档未找到 · Agent Template" };
}

export default async function DocsPage({ params }: DocsPageProps) {
  const { slug = [] } = await params;
  const root = await findZReadWikiRoot();
  const [catalog, document, sourcePaths] = await Promise.all([
    listZReadDocuments(root),
    readZReadDocument(root, slug),
    listZReadSourcePaths(root),
  ]);

  if (!document) {
    notFound();
  }

  const groups = groupCatalog(catalog);

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b bg-background">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-5 py-3 lg:px-8">
          <Link className="flex items-center gap-3" href="/docs">
            <Badge>AT</Badge>
            <span>
              <span className="block text-sm font-semibold">
                Agent Template
              </span>
              <span className="block text-xs text-muted-foreground">
                工程文档
              </span>
            </span>
          </Link>
          <nav aria-label="全局导航" className="flex items-center gap-1">
            <Button asChild size="sm" variant="ghost">
              <Link href="/">项目首页</Link>
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link href="/agent">Agent 控制台</Link>
            </Button>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-12 lg:px-8">
        <aside className="py-6 lg:sticky lg:top-16 lg:h-[calc(100dvh-4rem)] lg:overflow-y-auto lg:py-10">
          <Collapsible className="lg:hidden">
            <CollapsibleTrigger asChild>
              <Button className="w-full justify-between" variant="outline">
                文档目录
                <ChevronDown data-icon="inline-end" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4">
              <Card>
                <CardHeader>
                  <CardTitle>浏览文档</CardTitle>
                </CardHeader>
                <CardContent>
                  <DocsNavigation currentHref={document.href} groups={groups} />
                </CardContent>
              </Card>
            </CollapsibleContent>
          </Collapsible>
          <div className="hidden lg:flex lg:flex-col lg:gap-5">
            <Badge className="w-fit" variant="outline">
              Documentation
            </Badge>
            <DocsNavigation currentHref={document.href} groups={groups} />
          </div>
        </aside>

        <article className="min-w-0 py-10 lg:border-l lg:py-14 lg:pl-12">
          <Breadcrumb className="mb-8">
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href="/docs">文档</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{document.section}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div className="max-w-3xl">
            <h1 className="mb-8 text-balance text-3xl font-semibold md:text-4xl">
              {document.title}
            </h1>
            <DocsMarkdown
              currentSlug={document.slug}
              indexSlug={catalog[0]?.sourceSlug ?? "overview"}
              knownSlugs={new Set(catalog.map((entry) => entry.sourceSlug))}
              knownSourcePaths={new Set(sourcePaths)}
            >
              {document.content}
            </DocsMarkdown>
          </div>

          <footer className="mt-16 flex max-w-3xl flex-col gap-6 text-sm leading-6 text-muted-foreground">
            <Separator />
            <p className="text-pretty">
              本页由 ZRead 从当前仓库源码生成；更新入口为
              <code className="mx-1 rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                pnpm docs:zread:update
              </code>
              。
            </p>
          </footer>
        </article>
      </div>
    </main>
  );
}

function DocsNavigation({
  currentHref,
  groups,
}: {
  currentHref: string;
  groups: ReadonlyMap<string, readonly ZReadCatalogEntry[]>;
}) {
  return (
    <nav aria-label="文档目录" className="flex flex-col gap-7">
      {[...groups.entries()].map(([section, entries]) => (
        <section className="flex flex-col gap-2" key={section}>
          <Badge className="w-fit" variant="secondary">
            {section}
          </Badge>
          <ul className="flex flex-col gap-1">
            {entries.map((entry) => {
              const active = entry.href === currentHref;
              return (
                <li key={entry.relativePath}>
                  <Button
                    asChild
                    className="h-auto w-full justify-start whitespace-normal text-left"
                    size="sm"
                    variant={active ? "secondary" : "ghost"}
                  >
                    <Link
                      aria-current={active ? "page" : undefined}
                      href={entry.href}
                    >
                      {entry.title}
                    </Link>
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </nav>
  );
}

function groupCatalog(
  catalog: readonly ZReadCatalogEntry[],
): Map<string, ZReadCatalogEntry[]> {
  const groups = new Map<string, ZReadCatalogEntry[]>();
  for (const entry of catalog) {
    const entries = groups.get(entry.section) ?? [];
    entries.push(entry);
    groups.set(entry.section, entries);
  }
  return groups;
}
