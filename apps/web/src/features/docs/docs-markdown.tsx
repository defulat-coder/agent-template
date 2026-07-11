import { Children, isValidElement, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { createZReadHeadingId, resolveZReadHref } from "@/lib/zread-links";

export function DocsMarkdown({
  children,
  currentSlug,
  indexSlug,
  knownSlugs,
  knownSourcePaths,
}: {
  children: string;
  currentSlug: readonly string[];
  indexSlug: string;
  knownSlugs: ReadonlySet<string>;
  knownSourcePaths: ReadonlySet<string>;
}) {
  return (
    <ReactMarkdown
      components={{
        a: ({ children, href = "", ...props }) => {
          const resolvedHref = resolveZReadHref(
            currentSlug,
            href,
            indexSlug,
            knownSlugs,
            knownSourcePaths,
          );
          const external = /^[a-z][a-z\d+.-]*:/iu.test(resolvedHref);
          return (
            <a
              className="font-medium text-sky-700 underline decoration-sky-300 underline-offset-4 transition-colors hover:text-sky-950"
              href={resolvedHref}
              rel={external ? "noreferrer" : undefined}
              target={external ? "_blank" : undefined}
              {...props}
            >
              {children}
            </a>
          );
        },
        blockquote: ({ children }) => (
          <blockquote className="my-6 border-l-2 border-sky-300 bg-sky-50/70 py-2 pl-5 pr-4 text-slate-700">
            {children}
          </blockquote>
        ),
        code: ({ children, className }) => (
          <code
            className={`${className ?? ""} rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.88em] text-slate-900`}
          >
            {children}
          </code>
        ),
        h1: ({ children }) => (
          <h1 className="mb-6 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2
            className="mb-4 mt-12 scroll-mt-24 border-t border-slate-200 pt-8 text-2xl font-semibold tracking-tight text-slate-950"
            id={createZReadHeadingId(readText(children))}
          >
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3
            className="mb-3 mt-8 scroll-mt-24 text-xl font-semibold text-slate-900"
            id={createZReadHeadingId(readText(children))}
          >
            {children}
          </h3>
        ),
        hr: () => <hr className="my-10 border-slate-200" />,
        li: ({ children }) => <li className="pl-1 leading-7">{children}</li>,
        ol: ({ children }) => (
          <ol className="my-5 ml-6 list-decimal space-y-2">{children}</ol>
        ),
        p: ({ children }) => (
          <p className="my-5 leading-8 text-slate-700">{children}</p>
        ),
        pre: ({ children }) => (
          <pre className="my-6 overflow-x-auto rounded-lg border border-slate-800 bg-slate-950 p-4 text-sm leading-6 text-slate-100 shadow-sm [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-inherit">
            {children}
          </pre>
        ),
        table: ({ children }) => (
          <div className="my-6 overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full border-collapse text-left text-sm">
              {children}
            </table>
          </div>
        ),
        td: ({ children }) => (
          <td className="border-t border-slate-200 px-4 py-3 align-top leading-6 text-slate-700">
            {children}
          </td>
        ),
        th: ({ children }) => (
          <th className="bg-slate-100 px-4 py-3 font-semibold text-slate-900">
            {children}
          </th>
        ),
        ul: ({ children }) => (
          <ul className="my-5 ml-6 list-disc space-y-2">{children}</ul>
        ),
      }}
      remarkPlugins={[remarkGfm]}
    >
      {children}
    </ReactMarkdown>
  );
}

function readText(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) => {
      if (typeof child === "string" || typeof child === "number") {
        return String(child);
      }
      if (isValidElement<{ children?: ReactNode }>(child)) {
        return readText(child.props.children);
      }
      return "";
    })
    .join("");
}
