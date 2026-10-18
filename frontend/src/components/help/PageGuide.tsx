import { useEffect, useId, useRef, useState } from "react";
import { CircleHelp, Info, X } from "lucide-react";

import { readFlag, writeFlag } from "../../lib/onboardingStorage";
import { PAGE_GUIDES, type GuideId } from "../../lib/pageGuides";
import { Button, ButtonLink, Card, IconTile } from "../ui";

/**
 * "Cómo funciona esta página": open on the first visit, closable, reopenable, and
 * remembered per browser. Goes right after the page `<header>`. No API dependency,
 * so it is safe on `/demo` too.
 */
export function PageGuide({ id }: { id: GuideId }) {
  const guide = PAGE_GUIDES[id];
  const storageKey = `guide.${id}`;
  const headingId = useId();
  const [collapsed, setCollapsed] = useState(() => readFlag(storageKey) === "collapsed");
  // Only move focus after the learner toggles, never on the initial render.
  const pendingFocus = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const reopenRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!pendingFocus.current) return;
    pendingFocus.current = false;
    (collapsed ? reopenRef.current : headingRef.current)?.focus();
  }, [collapsed]);

  function toggle(next: boolean) {
    pendingFocus.current = true;
    writeFlag(storageKey, next ? "collapsed" : null);
    setCollapsed(next);
  }

  if (collapsed) {
    return (
      <div>
        <Button
          ref={reopenRef}
          type="button"
          variant="ghost"
          className="!min-h-9 !px-3 !py-1.5"
          onClick={() => toggle(false)}
        >
          <CircleHelp aria-hidden="true" className="h-4 w-4" />
          ¿Cómo funciona esta página?
        </Button>
      </div>
    );
  }

  return (
    <section aria-labelledby={headingId}>
      <Card variant="glass" className="flex items-start gap-3">
        <IconTile icon={Info} className="hidden h-10 w-10 sm:inline-flex" />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <h2
              id={headingId}
              ref={headingRef}
              tabIndex={-1}
              className="pt-2 font-display text-base font-semibold text-text-primary"
            >
              {guide.title}
            </h2>
            <button
              type="button"
              aria-label="Ocultar guía"
              onClick={() => toggle(true)}
              className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-text-muted hover:bg-surface-subtle hover:text-text-primary"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-text-muted marker:text-action-hover">
            {guide.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="ghost" className="!min-h-10 !py-2" onClick={() => toggle(true)}>
              Entendido
            </Button>
            {guide.next && (
              <ButtonLink to={guide.next.to} variant="secondary" className="!min-h-10 !py-2">
                Siguiente: {guide.next.label}
              </ButtonLink>
            )}
          </div>
        </div>
      </Card>
    </section>
  );
}
