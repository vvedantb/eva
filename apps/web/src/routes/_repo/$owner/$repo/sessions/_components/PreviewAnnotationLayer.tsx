"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence } from "motion/react";
import { useWebPreview } from "@vvedantb/ui";
import {
  annotationRef,
  buildAnnotationDisplay,
  buildAnnotationPrompt,
} from "../_utils/-previewAnnotation";
import type { AnnotationSubmit } from "@/lib/components/sandbox/annotationSend";
import { AnnotationCommentCard } from "./AnnotationCommentCard";
import { useAnnotationBridge } from "./useAnnotationBridge";

const CARD_WIDTH = 320;
const CARD_ESTIMATED_HEIGHT = 220;
const CARD_GAP = 8;

export function PreviewAnnotationLayer({
  mode,
  onModeChange,
  onSubmit,
}: {
  mode: boolean;
  onModeChange: (active: boolean) => void;
  onSubmit: AnnotationSubmit;
}) {
  const { iframeRef } = useWebPreview();
  const layerRef = useRef<HTMLDivElement | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { pending, clearPending } = useAnnotationBridge({
    iframeRef,
    mode,
  });

  const [cardPosition, setCardPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
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
      const layerRect = layer.getBoundingClientRect();
      const iframeRect = iframe.getBoundingClientRect();
      const left =
        iframeRect.left + pending.rect.left + Math.min(pending.rect.width, 40);
      const top =
        iframeRect.top + pending.rect.top + pending.rect.height + CARD_GAP;
      const minLeft = layerRect.left + 8;
      const cardWidth = Math.min(CARD_WIDTH, window.innerWidth - 32);
      const maxLeft = Math.max(minLeft, layerRect.right - cardWidth - 8);
      const minTop = layerRect.top + 8;
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
    const observer = new ResizeObserver(place);
    observer.observe(cardEl);
    return () => {
      observer.disconnect();
    };
  }, [pending, iframeRef, cardEl]);

  return (
    <div ref={layerRef} className="pointer-events-none absolute inset-0 z-10">
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
                    void onSubmit(
                      display,
                      full,
                      annotationRef(pending.context),
                    )
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
