import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "../ui";

/** A fixed shell command with a copy button. Clipboard access can fail: it never throws. */
export function CopyableCommand({ label, command }: { label: string; command: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-1">
      <p className="text-sm font-medium text-text-primary">{label}</p>
      <div className="flex flex-col items-stretch gap-2 sm:flex-row">
        <code
          tabIndex={0}
          className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-control border border-line bg-surface-subtle px-3 py-2 font-mono text-sm text-text-primary"
        >
          {command}
        </code>
        <Button
          type="button"
          variant="secondary"
          className="!min-h-10 shrink-0 !px-3 sm:w-auto"
          aria-label={`Copiar comando: ${command}`}
          onClick={() => void copy()}
        >
          {copied ? <Check aria-hidden="true" className="h-4 w-4" /> : <Copy aria-hidden="true" className="h-4 w-4" />}
          <span>{copied ? "Copiado" : "Copiar"}</span>
        </Button>
      </div>
    </div>
  );
}
