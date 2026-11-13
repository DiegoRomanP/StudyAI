import ReactMarkdown, { type Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import "katex/dist/katex.min.css";

// LLM-written Markdown may contain URLs; the app never renders an LLM-generated URL
// (see lib/youtube.ts). Links keep their text, and remote images are dropped.
// KaTeX runs with its default trust: false, so \href and \includegraphics stay inert.
// Headings drop one level so the page's own h1 stays the only one.
const SAFE_COMPONENTS: Components = {
  a: ({ children }) => <span className="font-medium text-text-primary">{children}</span>,
  h1: ({ children }) => <h2>{children}</h2>,
  h2: ({ children }) => <h3>{children}</h3>,
  h3: ({ children }) => <h4>{children}</h4>,
  h4: ({ children }) => <h5>{children}</h5>,
  h5: ({ children }) => <h6>{children}</h6>,
  h6: ({ children }) => <h6>{children}</h6>,
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse text-left text-sm [&_td]:border [&_td]:border-line [&_td]:p-2 [&_th]:border [&_th]:border-line [&_th]:p-2">
        {children}
      </table>
    </div>
  ),
};

export function SafeMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      disallowedElements={["img"]}
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={SAFE_COMPONENTS}
    >
      {children}
    </ReactMarkdown>
  );
}
