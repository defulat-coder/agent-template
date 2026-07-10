import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function AgentMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      components={{
        a: ({ children, ...props }) => (
          <a className="font-medium text-slate-950 underline underline-offset-4" rel="noreferrer" target="_blank" {...props}>
            {children}
          </a>
        ),
        blockquote: ({ children }) => <blockquote className="border-l-2 border-slate-200 pl-3 text-slate-600">{children}</blockquote>,
        code: ({ children }) => <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.85em]">{children}</code>,
        h1: ({ children }) => <h1 className="text-xl font-semibold leading-7 text-slate-950">{children}</h1>,
        h2: ({ children }) => <h2 className="text-lg font-semibold leading-7 text-slate-950">{children}</h2>,
        h3: ({ children }) => <h3 className="text-base font-semibold leading-6 text-slate-950">{children}</h3>,
        li: ({ children }) => <li className="leading-6">{children}</li>,
        ol: ({ children }) => <ol className="ml-5 list-decimal">{children}</ol>,
        p: ({ children }) => <p className="leading-6">{children}</p>,
        pre: ({ children }) => <pre className="overflow-x-auto rounded-md bg-slate-950 p-3 text-sm text-white">{children}</pre>,
        table: ({ children }) => (
          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="w-full border-collapse text-sm">{children}</table>
          </div>
        ),
        td: ({ children }) => <td className="border-t border-slate-200 px-3 py-2 align-top">{children}</td>,
        th: ({ children }) => <th className="bg-slate-50 px-3 py-2 text-left font-medium text-slate-700">{children}</th>,
        ul: ({ children }) => <ul className="ml-5 list-disc">{children}</ul>
      }}
      remarkPlugins={[remarkGfm]}
    >
      {children}
    </ReactMarkdown>
  );
}
