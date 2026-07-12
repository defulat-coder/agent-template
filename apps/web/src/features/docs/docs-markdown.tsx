import { Children, isValidElement, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Separator } from "@agent-template/ui/components/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@agent-template/ui/components/table";
import { cn } from "@agent-template/ui/lib/utils";
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
              className="font-medium text-primary underline underline-offset-4"
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
          <blockquote className="my-6 border-l-2 pl-4 text-muted-foreground">
            {children}
          </blockquote>
        ),
        code: ({ children, className }) => (
          <code
            className={cn(
              "rounded bg-muted px-1.5 py-0.5 font-mono text-[0.88em] text-foreground",
              className,
            )}
          >
            {children}
          </code>
        ),
        h1: ({ children }) => (
          <h1 className="mb-6 text-balance text-3xl font-semibold md:text-4xl">
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2
            className="mb-4 mt-12 scroll-mt-24 border-t pt-8 text-balance text-2xl font-semibold"
            id={createZReadHeadingId(readText(children))}
          >
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3
            className="mb-3 mt-8 scroll-mt-24 text-balance text-xl font-semibold"
            id={createZReadHeadingId(readText(children))}
          >
            {children}
          </h3>
        ),
        hr: () => <Separator className="my-10" />,
        li: ({ children }) => <li className="pl-1 leading-7">{children}</li>,
        ol: ({ children }) => (
          <ol className="my-5 ml-6 flex list-decimal flex-col gap-2">
            {children}
          </ol>
        ),
        p: ({ children }) => (
          <p className="my-5 text-pretty leading-8 text-muted-foreground">
            {children}
          </p>
        ),
        pre: ({ children }) => (
          <pre className="my-6 overflow-x-auto rounded-md border bg-muted p-4 font-mono text-sm leading-6 [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-inherit">
            {children}
          </pre>
        ),
        table: ({ children }) => <Table className="my-6">{children}</Table>,
        tbody: ({ children }) => <TableBody>{children}</TableBody>,
        td: ({ children }) => (
          <TableCell className="whitespace-normal align-top leading-6">
            {children}
          </TableCell>
        ),
        th: ({ children }) => (
          <TableHead className="whitespace-normal">{children}</TableHead>
        ),
        thead: ({ children }) => <TableHeader>{children}</TableHeader>,
        tr: ({ children }) => <TableRow>{children}</TableRow>,
        ul: ({ children }) => (
          <ul className="my-5 ml-6 flex list-disc flex-col gap-2">
            {children}
          </ul>
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
