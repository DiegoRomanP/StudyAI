import ReactMarkdown, { type Components } from "react-markdown";

// LLM-written Markdown may contain URLs; the app never renders an LLM-generated URL
// (see lib/youtube.ts). Links keep their text, and remote images are dropped.
// Headings drop one level so the page's own h1 stays the only one.
const SAFE_COMPONENTS: Components = {
  a: ({ children }) => <span className="font-medium text-text-primary">{children}</span>,
  h1: ({ children }) => <h2>{children}</h2>,
  h2: ({ children }) => <h3>{children}</h3>,
  h3: ({ children }) => <h4>{children}</h4>,
  h4: ({ children }) => <h5>{children}</h5>,
  h5: ({ children }) => <h6>{children}</h6>,
  h6: ({ children }) => <h6>{children}</h6>,
};

export function SafeMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown disallowedElements={["img"]} components={SAFE_COMPONENTS}>
      {children}
    </ReactMarkdown>
  );
}
