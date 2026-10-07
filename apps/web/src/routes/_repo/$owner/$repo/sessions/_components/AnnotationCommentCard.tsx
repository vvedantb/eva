"use client";

import { useState } from "react";
import { m } from "motion/react";
import {
  Button,
  CodeBlock,
  CodeBlockCopyButton,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Textarea,
  motionSpring,
} from "@eva/ui";
import { IconChevronRight } from "@tabler/icons-react";
import {
  elementChip,
  type PreviewAnnotationContext,
} from "../_utils/-previewAnnotation";

/**
 * The styles the reader gets to see, as `prop` / `value` pairs.
 *
 * `stylesSummary` is the injected script's tag-aware pick — it already dropped
 * the values that carry no signal — so it wins when a sandbox is new enough to
 * send it. Older sandboxes still post the fixed `computedStyles` bag, and the
 * empty entries in it are filtered out here instead.
 */
function styleLines(
  context: PreviewAnnotationContext,
): { prop: string; value: string }[] {
  if (context.stylesSummary) {
    const out: { prop: string; value: string }[] = [];
    for (const entry of context.stylesSummary.split("; ")) {
      const separator = entry.indexOf(": ");
      const prop = separator === -1 ? entry : entry.slice(0, separator);
      if (prop.length === 0) continue;
      out.push({
        prop,
        value: separator === -1 ? "" : entry.slice(separator + 2),
      });
    }
    return out;
  }
  return Object.entries(context.computedStyles)
    .filter(([, value]) => value.length > 0)
    .map(([prop, value]) => ({ prop, value }));
}

export function AnnotationCommentCard({
  cardRef,
  context,
  position,
  onSubmit,
  onCancel,
  isSubmitting,
}: {
  /**
   * Hands the root node to `PreviewAnnotationLayer`, which observes its height
   * so expanding the details accordion re-clamps the card into the panel.
   */
  cardRef: (node: HTMLDivElement | null) => void;
  context: PreviewAnnotationContext;
  position: { left: number; top: number };
  onSubmit: (feedback: string) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}) {
  const [text, setText] = useState("");
  // Ephemeral, per-annotation: the details are worth a look once, and the card
  // is thrown away on submit or cancel, so there is nothing to persist.
  const [detailsOpen, setDetailsOpen] = useState(false);
  const reactName = context.reactComponents[0];
  const previewText =
    context.textContent.length > 60
      ? `${context.textContent.slice(0, 57)}...`
      : context.textContent;
  // Display only — the agent prompt still carries the untouched `outerHTML`.
  const prettyHtml = context.outerHTML.replace(/></g, ">\n<");
  const styles = styleLines(context);

  function handleSubmit() {
    const trimmed = text.trim();
    if (!trimmed || isSubmitting) return;
    onSubmit(trimmed);
  }

  return (
    <m.div
      ref={cardRef}
      // `w-80` is exactly a 320px viewport, so the card hung off the edge with
      // no gutter. The expression matches `CARD_WIDTH` clamping in
      // `PreviewAnnotationLayer` — keep the two in step.
      // `fixed` + viewport left/top: this is the AnimatePresence child, so it
      // cannot sit inside a full-screen wrapper (that would scale from the
      // viewport origin). z-50 keeps it above the hosted iframe overlay.
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={motionSpring}
      className="pointer-events-auto fixed z-50 w-[min(20rem,calc(100vw-2rem))] rounded-lg bg-popover p-3 smooth-shadow-ring-lg"
      style={{ left: position.left, top: position.top }}
    >
      <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
        <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          {/* The identity chips double as the disclosure: the reader already
              reads them to check they hit the right element, so there is no
              second control to explain. */}
          <CollapsibleTrigger className="motion-press flex min-w-0 shrink-0 items-center gap-1.5 active:scale-[0.98] [&[data-state=open]>svg]:rotate-90">
            <IconChevronRight
              size={13}
              aria-hidden
              className="shrink-0 transition-transform duration-[var(--motion-base)]"
            />
            <span className="rounded-md border border-border bg-card px-1.5 py-0.5 font-mono text-foreground">
              {elementChip(context)}
            </span>
            {reactName ? (
              <span className="rounded-md border border-border bg-card px-1.5 py-0.5">
                {reactName}
              </span>
            ) : null}
          </CollapsibleTrigger>
          {/* Outside the trigger: it is the widest, most compressible part of
              the row, and it should give up its space before the chips do. */}
          {previewText ? (
            <span className="min-w-0 truncate italic">{previewText}</span>
          ) : null}
        </div>

        {context.accessibility ? (
          <p className="mb-2 truncate text-[11px] text-muted-foreground">
            {context.accessibility}
          </p>
        ) : null}

        <CollapsibleContent>
          <div className="mb-2 space-y-2">
            <CodeBlock code={prettyHtml} language="html" className="text-xs">
              <CodeBlockCopyButton />
              {/* Scroll on the `pre`, not on the CodeBlock wrapper: the copy
                  button anchors to the wrapper, and a scrolling wrapper would
                  carry it out of view on the first drag. */}
              <pre className="max-h-40 overflow-auto p-3 text-xs">
                <code>{prettyHtml}</code>
              </pre>
            </CodeBlock>
            {styles.length > 0 ? (
              <div className="max-h-32 space-y-0.5 overflow-auto font-mono text-xs">
                {styles.map((line, index) => (
                  <div key={`${line.prop}-${index}`} className="flex gap-1.5">
                    <span className="shrink-0 text-muted-foreground">
                      {line.prop}:
                    </span>
                    <span className="min-w-0 break-all text-foreground">
                      {line.value}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </CollapsibleContent>
      </Collapsible>

      <Textarea
        autoFocus
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="What should Eva change?"
        className="min-h-20 resize-none text-sm"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
            return;
          }
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            handleSubmit();
          }
        }}
      />
      <div className="mt-2 flex justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={handleSubmit}
          disabled={!text.trim() || isSubmitting}
        >
          Send to Eva
        </Button>
      </div>
    </m.div>
  );
}
