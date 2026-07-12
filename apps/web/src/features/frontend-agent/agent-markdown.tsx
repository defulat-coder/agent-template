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
    <div className="typeset typeset-agent max-w-[70ch] text-pretty">
      <ReactMarkdown
        components={{
          a: ({ children, ...props }) => (
            <a
              className="text-primary"
              rel="noreferrer"
              target="_blank"
              {...props}
            >
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="text-muted-foreground">
              {children}
            </blockquote>
          ),
          h1: ({ children }) => <h1 className="text-balance">{children}</h1>,
          h2: ({ children }) => <h2 className="text-balance">{children}</h2>,
          h3: ({ children }) => <h3 className="text-balance">{children}</h3>,
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
