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
    <div className="typeset typeset-docs max-w-[70ch] text-pretty">
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
                className="text-primary"
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
            <blockquote className="text-muted-foreground">
              {children}
            </blockquote>
          ),
          h1: ({ children }) => <h1 className="text-balance">{children}</h1>,
          h2: ({ children }) => (
            <h2
              className="text-balance"
              id={createZReadHeadingId(readText(children))}
            >
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3
              className="text-balance"
              id={createZReadHeadingId(readText(children))}
            >
              {children}
            </h3>
          ),
          hr: () => <Separator className="my-10" />,
          table: ({ children }) => <Table>{children}</Table>,
          tbody: ({ children }) => <TableBody>{children}</TableBody>,
          td: ({ children }) => (
            <TableCell className="whitespace-normal">{children}</TableCell>
          ),
          th: ({ children }) => (
            <TableHead className="whitespace-normal">{children}</TableHead>
          ),
          thead: ({ children }) => <TableHeader>{children}</TableHeader>,
          tr: ({ children }) => <TableRow>{children}</TableRow>,
        }}
        remarkPlugins={[remarkGfm]}
      >
        {children}
      </ReactMarkdown>
    </div>
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
