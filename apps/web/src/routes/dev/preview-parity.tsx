import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { tempId } from "@vvedantb/server";
import type { PreviewAnnotationContext } from "@eva/shared/previewAnnotationContext";
import { AnnotationCommentCard } from "@/routes/_repo/$owner/$repo/sessions/_components/AnnotationCommentCard";
import {
  PreviewCommentsDrawer,
} from "@/routes/_repo/$owner/$repo/sessions/_components/PreviewCommentsDrawer";
import type { PreviewComment } from "@/routes/_repo/$owner/$repo/sessions/_components/PreviewCommentCard";
import { readPreviewToolbarTheme } from "@/routes/_repo/$owner/$repo/sessions/_utils/previewToolbarTheme";

/**
 * The real preview card and comments drawer, with fixed data. `pnpm
 * preview:parity` measures them here and compares them with the copies the
 * proxy injects into a direct sandbox link (`packages/backend/preview-
 * annotation-src`). Keep the data in step with `scripts/preview-parity.mjs`.
 * Dev only.
 */
export const Route = createFileRoute("/dev/preview-parity")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) {
      throw redirect({ to: "/" });
    }
  },
  component: PreviewParity,
});

Reflect.set(window, "evaPreviewParity", { readTheme: readPreviewToolbarTheme });

const NOW = Date.now();

const CONTEXT: PreviewAnnotationContext = {
  tagName: "button",
  id: "",
  classNames: ["btn-primary"],
  selector: "button.btn-primary",
  textContent: "Save changes",
  outerHTML:
    // design-check-ignore-next-line — sample element HTML in a string, not a rendered button
    '<button class="btn-primary" aria-label="Save changes">Save changes</button>',
  attributes: {},
  boundingRect: { top: 0, left: 0, width: 100, height: 30 },
  computedStyles: {
    color: "rgb(255, 255, 255)",
    backgroundColor: "rgb(37, 99, 235)",
    fontSize: "13px",
    fontWeight: "400",
    fontFamily: "Inter",
    display: "block",
    position: "static",
    margin: "0px",
    padding: "10px 18px",
    borderRadius: "8px",
  },
  reactComponents: [],
  accessibility: 'aria-label="Save changes", focusable',
  stylesSummary: "background-color: rgb(37, 99, 235); color: rgb(255, 255, 255)",
  pageUrl: "https://example.test/",
  pagePath: "/",
  capturedAt: NOW,
};

const COMMENTS: PreviewComment[] = [
  {
    kind: "message",
    id: tempId("messages"),
    feedback: "Give this button more padding and a darker blue",
    element: "<button.btn-primary>",
    pagePath: "/",
    timestamp: NOW - 120_000,
    reply: {
      status: "done",
      excerpt:
        "I increased the padding to 14px 24px and changed the background to blue-700.",
    },
  },
  {
    kind: "message",
    id: tempId("messages"),
    feedback: "Make the heading smaller",
    element: "<h1.title>",
    pagePath: "/",
    timestamp: NOW - 3_600_000,
    reply: { status: "working" },
  },
  {
    kind: "queued",
    id: tempId("queuedMessages"),
    feedback: "Add a cancel button next to Save",
    element: "<div.actions>",
    pagePath: "/",
    timestamp: NOW - 30_000,
  },
];

function PreviewParity() {
  const [frame, setFrame] = useState<HTMLIFrameElement | null>(null);
  return (
    <div className="min-h-screen p-6">
      <iframe
        ref={setFrame}
        title="Preview"
        className="fixed top-2 left-[440px] h-[520px] w-[900px] border-0"
      />
      <AnnotationCommentCard
        cardRef={() => {}}
        context={CONTEXT}
        position={{ left: 24, top: 24 }}
        onSubmit={() => {}}
        onCancel={() => {}}
        isSubmitting={false}
      />
      {frame ? (
        <PreviewCommentsDrawer
          iframeElement={frame}
          comments={COMMENTS}
          previewPath="/"
          onViewInChat={() => {}}
          onClose={() => {}}
        />
      ) : null}
    </div>
  );
}
