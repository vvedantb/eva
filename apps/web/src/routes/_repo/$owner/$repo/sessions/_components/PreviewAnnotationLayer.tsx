"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence } from "motion/react";
import { useWebPreview } from "@eva/ui";
import {
  buildAnnotationDisplay,
  buildAnnotationPrompt,
} from "../_utils/-previewAnnotation";
import { AnnotationCommentCard } from "./AnnotationCommentCard";
import { useAnnotationBridge } from "./useAnnotationBridge";

const CARD_WIDTH = 320;
// First-paint guess only, for the frame before the card exists to be measured.
// It matches the collapsed card; every later frame uses the real height, so the
// details accordion no longer needs headroom baked into this number.
const CARD_ESTIMATED_HEIGHT = 220;
const CARD_GAP = 8;

export function PreviewAnnotationLayer({
  mode,
  onModeChange,
  onSubmit,
}: {
  mode: boolean;
  onModeChange: (active: boolean) => void;
  onSubmit: (display: string, full: string) => Promise<void>;
}) {
  const { iframeRef } = useWebPreview();
  const layerRef = useRef<HTMLDivElement | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { pending, clearPending } = useAnnotationBridge({
    iframeRef,
    mode,
  });

  // Measured in a layout effect rather than during render: reading
  // getBoundingClientRect from refs mid-render makes React Compiler bail on
  // the whole file, and the DOM nodes are only guaranteed after commit anyway.
  const [cardPosition, setCardPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  // State, not a ref, so mounting the card re-runs the effect below and lets it
  // measure the real element and start observing it.
  const [cardEl, setCardEl] = useState<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const layer = layerRef.current;
    const iframe = iframeRef.current;
    if (!pending || !layer || !iframe) {
      setCardPosition(null);
      return;
    }

    function place(): void {
      if (!pending || !layer || !iframe) return;
      // Viewport coordinates: the card renders in a fixed body portal (z-50)
      // because the preview iframe lives in the fixed z-40 host overlay — an
      // in-panel absolute card would paint underneath it.
      const layerRect = layer.getBoundingClientRect();
      const iframeRect = iframe.getBoundingClientRect();
      const left =
        iframeRect.left + pending.rect.left + Math.min(pending.rect.width, 40);
      const top =
        iframeRect.top + pending.rect.top + pending.rect.height + CARD_GAP;
      const minLeft = layerRect.left + 8;
      // The card shrinks to `100vw - 2rem` on a narrow viewport, so clamping
      // against a flat 320px would push it off the right edge on a phone.
      const cardWidth = Math.min(CARD_WIDTH, window.innerWidth - 32);
      const maxLeft = Math.max(minLeft, layerRect.right - cardWidth - 8);
      const minTop = layerRect.top + 8;
      // Real height once the card is mounted: opening the details accordion
      // grows it well past any constant, and a stale guess pushes the buttons
      // off the bottom of the panel.
      // Layout height, not getBoundingClientRect: the card springs scale on
      // mount, and a transformed height would re-clamp the position mid-enter.
      const cardHeight = cardEl ? cardEl.offsetHeight : CARD_ESTIMATED_HEIGHT;
      const maxTop = Math.max(minTop, layerRect.bottom - cardHeight - 8);
      const next = {
        left: Math.min(Math.max(minLeft, left), maxLeft),
        top: Math.min(Math.max(minTop, top), maxTop),
      };
      setCardPosition((prev) =>
        prev && prev.left === next.left && prev.top === next.top ? prev : next,
      );
    }

    place();

    if (!cardEl) return;
    // The accordion animates its height, so a single re-measure on toggle would
    // read the collapsed value. Observing the card instead tracks it across the
    // whole transition. Repositioning only writes left/top, never size, so this
    // cannot feed itself.
    const observer = new ResizeObserver(place);
    observer.observe(cardEl);
    return () => {
      observer.disconnect();
    };
  }, [pending, iframeRef, cardEl]);

  return (
    <div ref={layerRef} className="pointer-events-none absolute inset-0 z-10">
      {/* Presence stays portalled so cancel/submit can play the card exit. */}
      {typeof document !== "undefined"
        ? createPortal(
            <AnimatePresence>
              {pending && cardPosition ? (
                <AnnotationCommentCard
                  cardRef={setCardEl}
                  context={pending.context}
                  position={cardPosition}
                  isSubmitting={isSubmitting}
                  onCancel={clearPending}
                  onSubmit={(feedback) => {
                    const display = buildAnnotationDisplay(
                      feedback,
                      pending.context,
                    );
                    const full = buildAnnotationPrompt(
                      feedback,
                      pending.context,
                    );
                    setIsSubmitting(true);
                    void onSubmit(display, full)
                      .then(() => {
                        clearPending();
                        onModeChange(false);
                      })
                      .finally(() => {
                        setIsSubmitting(false);
                      });
                  }}
                />
              ) : null}
            </AnimatePresence>,
            document.body,
          )
        : null}
    </div>
  );
}
