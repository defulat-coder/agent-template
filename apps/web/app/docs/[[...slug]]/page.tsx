import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DocsMarkdown } from "@/features/docs/docs-markdown";
import {
  listZReadDocuments,
  readZReadDocument,
  type ZReadCatalogEntry,
} from "@/lib/zread-catalog";
import { findZReadWikiRoot } from "@/lib/zread-root";

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
  const [catalog, document] = await Promise.all([
    listZReadDocuments(root),
    readZReadDocument(root, slug),
  ]);

  if (!document) {
    notFound();
  }

  const groups = groupCatalog(catalog);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="sticky top-0 z-20 border-b border-slate-200/90 bg-slate-50/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 lg:px-8">
          <Link className="flex items-center gap-3" href="/docs">
            <span className="flex size-8 items-center justify-center rounded-md bg-slate-950 font-mono text-sm font-semibold text-white">
              AT
            </span>
            <span>
              <span className="block text-sm font-semibold">
                Agent Template
              </span>
              <span className="block text-xs text-slate-500">工程文档</span>
            </span>
          </Link>
          <nav
            aria-label="全局导航"
            className="flex items-center gap-5 text-sm"
          >
            <Link className="text-slate-600 hover:text-slate-950" href="/">
              项目首页
            </Link>
            <Link className="text-slate-600 hover:text-slate-950" href="/agent">
              Agent 控制台
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-12 lg:px-8">
        <aside className="py-6 lg:sticky lg:top-16 lg:h-[calc(100vh-4rem)] lg:overflow-y-auto lg:py-10">
          <details className="rounded-lg border border-slate-200 bg-white p-4 lg:hidden">
            <summary className="cursor-pointer text-sm font-semibold">
              文档目录
            </summary>
            <DocsNavigation currentHref={document.href} groups={groups} />
          </details>
          <div className="hidden lg:block">
            <p className="mb-5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Documentation
            </p>
            <DocsNavigation currentHref={document.href} groups={groups} />
          </div>
        </aside>

        <article className="min-w-0 border-slate-200 py-10 lg:border-l lg:py-14 lg:pl-12">
          <div className="mb-8 flex items-center gap-2 text-sm text-slate-500">
            <Link className="hover:text-slate-950" href="/docs">
              文档
            </Link>
            <span aria-hidden="true">/</span>
            <span>{document.section}</span>
          </div>
          <div className="max-w-3xl">
            <DocsMarkdown
              currentSlug={document.slug}
              indexSlug={catalog[0]?.sourceSlug ?? "overview"}
            >
              {document.content}
            </DocsMarkdown>
          </div>
          <footer className="mt-16 max-w-3xl border-t border-slate-200 pt-6 text-sm leading-6 text-slate-500">
            本页由 ZRead 从当前仓库源码生成；更新入口为
            <code className="mx-1 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700">
              pnpm docs:zread:update
            </code>
            。
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
    <nav aria-label="文档目录" className="mt-5 space-y-7 lg:mt-0">
      {[...groups.entries()].map(([section, entries]) => (
        <section key={section}>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
            {section}
          </h2>
          <ul className="space-y-1">
            {entries.map((entry) => {
              const active = entry.href === currentHref;
              return (
                <li key={entry.relativePath}>
                  <Link
                    aria-current={active ? "page" : undefined}
                    className={`block rounded-md px-3 py-2 text-sm leading-5 transition-colors ${
                      active
                        ? "bg-slate-900 font-medium text-white"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                    }`}
                    href={entry.href}
                  >
                    {entry.title}
                  </Link>
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
