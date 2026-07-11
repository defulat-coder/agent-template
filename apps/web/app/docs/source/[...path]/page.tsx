import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { findZReadWikiRoot } from "@/lib/zread-root";
import {
  listZReadSourcePaths,
  readZReadSourceFile,
} from "@/lib/zread-sources";

type SourcePageProps = {
  params: Promise<{ path: string[] }>;
};

export const dynamicParams = false;

export async function generateStaticParams() {
  const sourcePaths = await listZReadSourcePaths(await findZReadWikiRoot());
  return sourcePaths.map((sourcePath) => ({ path: sourcePath.split("/") }));
}

export async function generateMetadata({
  params,
}: SourcePageProps): Promise<Metadata> {
  const { path } = await params;
  return {
    title: `${path.join("/")} · Agent Template 源码`,
    description: `ZRead Wiki 引用的项目源码：${path.join("/")}`,
  };
}

export default async function SourcePage({ params }: SourcePageProps) {
  const { path } = await params;
  const source = await readZReadSourceFile(await findZReadWikiRoot(), path);
  if (!source) {
    notFound();
  }

  const lines = source.content.split("\n");

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/95 backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-[96rem] items-center justify-between gap-4 px-5 py-3 lg:px-8">
          <div className="min-w-0">
            <Link
              className="text-sm font-medium text-sky-400 hover:text-sky-300"
              href="/docs"
            >
              返回工程文档
            </Link>
            <h1 className="mt-1 truncate font-mono text-sm text-slate-300">
              {source.sourcePath}
            </h1>
          </div>
          <span className="shrink-0 text-xs text-slate-500">
            {lines.length} 行
          </span>
        </div>
      </header>

      <div className="overflow-x-auto py-5">
        <pre className="min-w-max font-mono text-[13px] leading-6">
          <code>
            {lines.map((line, index) => {
              const lineNumber = index + 1;
              return (
                <span
                  className="group block scroll-mt-20 px-5 target:bg-amber-950/50 hover:bg-slate-900 lg:px-8"
                  id={`L${lineNumber}`}
                  key={lineNumber}
                >
                  <a
                    aria-label={`第 ${lineNumber} 行`}
                    className="mr-5 inline-block w-12 select-none text-right text-slate-600 group-hover:text-slate-400"
                    href={`#L${lineNumber}`}
                  >
                    {lineNumber}
                  </a>
                  <span>{line || " "}</span>
                  {"\n"}
                </span>
              );
            })}
          </code>
        </pre>
      </div>
    </main>
  );
}
