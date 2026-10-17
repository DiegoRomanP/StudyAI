import ReactMarkdown, { type Components } from "react-markdown";

// LLM-written Markdown may contain URLs; the app never renders an LLM-generated URL
// (see lib/youtube.ts). Links keep their text, and remote images are dropped.
const SAFE_COMPONENTS: Components = {
  a: ({ children }) => <span className="font-medium text-text-primary">{children}</span>,
};

export function SafeMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown disallowedElements={["img"]} components={SAFE_COMPONENTS}>
      {children}
    </ReactMarkdown>
  );
}
