import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function AgentMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      components={{
        a: ({ children, ...props }) => (
          <a
            className="font-medium text-[var(--agent-ink)] underline decoration-[var(--agent-border-strong)] underline-offset-4 hover:decoration-[var(--agent-accent)]"
            rel="noreferrer"
            target="_blank"
            {...props}
          >
            {children}
          </a>
        ),
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-[var(--agent-border-strong)] pl-4 text-[var(--agent-secondary)]">
            {children}
          </blockquote>
        ),
        code: ({ children }) => (
          <code className="rounded bg-[var(--agent-inset)] px-1 py-0.5 font-mono text-[0.85em]">
            {children}
          </code>
        ),
        h1: ({ children }) => (
          <h1 className="text-[28px] font-semibold leading-9 tracking-[-0.02em] text-[var(--agent-ink)]">
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="mt-7 text-xl font-semibold leading-7 tracking-[-0.01em] text-[var(--agent-ink)]">
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="mt-6 text-base font-semibold leading-6 text-[var(--agent-ink)]">
            {children}
          </h3>
        ),
        li: ({ children }) => <li className="leading-7">{children}</li>,
        ol: ({ children }) => (
          <ol className="ml-5 list-decimal space-y-1">{children}</ol>
        ),
        p: ({ children }) => <p className="leading-7">{children}</p>,
        pre: ({ children }) => (
          <pre className="overflow-x-auto rounded-lg bg-[var(--agent-ink)] p-4 font-mono text-sm leading-6 text-white">
            {children}
          </pre>
        ),
        table: ({ children }) => (
          <div className="my-5 overflow-x-auto rounded-lg border border-[var(--agent-border)]">
            <table className="w-full border-collapse text-sm tabular-nums">
              {children}
            </table>
          </div>
        ),
        td: ({ children }) => (
          <td className="border-t border-[var(--agent-border)] px-4 py-2.5 align-top">
            {children}
          </td>
        ),
        th: ({ children }) => (
          <th className="bg-[var(--agent-canvas)] px-4 py-2.5 text-left font-medium text-[var(--agent-secondary)]">
            {children}
          </th>
        ),
        ul: ({ children }) => (
          <ul className="ml-5 list-disc space-y-1">{children}</ul>
        ),
      }}
      remarkPlugins={[remarkGfm]}
    >
      {children}
    </ReactMarkdown>
  );
}
