import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@agent-template/ui/components/table";

export function AgentMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      components={{
        a: ({ children, ...props }) => (
          <a
            className="font-medium text-primary underline underline-offset-4"
            rel="noreferrer"
            target="_blank"
            {...props}
          >
            {children}
          </a>
        ),
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 pl-4 text-muted-foreground">
            {children}
          </blockquote>
        ),
        code: ({ children }) => (
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">
            {children}
          </code>
        ),
        h1: ({ children }) => (
          <h1 className="text-balance text-2xl font-semibold">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="mt-7 text-balance text-xl font-semibold">
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="mt-6 text-balance text-base font-semibold">
            {children}
          </h3>
        ),
        li: ({ children }) => <li className="leading-7">{children}</li>,
        ol: ({ children }) => (
          <ol className="ml-5 flex list-decimal flex-col gap-1">{children}</ol>
        ),
        p: ({ children }) => (
          <p className="text-pretty leading-7">{children}</p>
        ),
        pre: ({ children }) => (
          <pre className="overflow-x-auto rounded-md border bg-muted p-4 font-mono text-sm leading-6 [&_code]:bg-transparent [&_code]:p-0">
            {children}
          </pre>
        ),
        table: ({ children }) => <Table className="my-5">{children}</Table>,
        tbody: ({ children }) => <TableBody>{children}</TableBody>,
        td: ({ children }) => (
          <TableCell className="whitespace-normal align-top">
            {children}
          </TableCell>
        ),
        th: ({ children }) => (
          <TableHead className="whitespace-normal">{children}</TableHead>
        ),
        thead: ({ children }) => <TableHeader>{children}</TableHeader>,
        tr: ({ children }) => <TableRow>{children}</TableRow>,
        ul: ({ children }) => (
          <ul className="ml-5 flex list-disc flex-col gap-1">{children}</ul>
        ),
      }}
      remarkPlugins={[remarkGfm]}
    >
      {children}
    </ReactMarkdown>
  );
}
