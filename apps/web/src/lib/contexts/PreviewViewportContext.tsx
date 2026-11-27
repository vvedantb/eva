"use client";

// useEffect: publish the preview pane's size to the chat, which sits in another subtree.
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

/** The size the user set for the preview frame, in CSS px. */
export interface PublishedPreviewViewport {
  width: number;
  height: number;
  /** A device name ("iPhone 12 Pro") when the size came from a preset. */
  label: string | undefined;
}

interface PreviewViewportValue {
  viewport: PublishedPreviewViewport | null;
  publish: (viewport: PublishedPreviewViewport | null) => void;
}

const PreviewViewportContext = createContext<PreviewViewportValue | null>(null);

/**
 * Carries the preview's custom size from the preview pane to the chat, so the
 * next message can tell the agent what the user is looking at. One stack with
 * the other pending-context providers: every sandbox surface gets it.
 */
export function PreviewViewportProvider({ children }: { children: ReactNode }) {
  const [viewport, publish] = useState<PublishedPreviewViewport | null>(null);
  return (
    <PreviewViewportContext value={{ viewport, publish }}>
      {children}
    </PreviewViewportContext>
  );
}

/** The published size, or null: fill mode, no preview, or no provider. */
export function usePreviewViewport(): PublishedPreviewViewport | null {
  return useContext(PreviewViewportContext)?.viewport ?? null;
}

/**
 * Publishes `viewport` while the calling pane is mounted and visible; passing
 * null (fill mode) clears it. A hidden pane's cleanup clears it too, so one
 * pane's size never outlives its preview.
 */
export function usePublishPreviewViewport(
  viewport: PublishedPreviewViewport | null,
) {
  const publish = useContext(PreviewViewportContext)?.publish;
  const width = viewport?.width;
  const height = viewport?.height;
  const label = viewport?.label;
  useEffect(() => {
    if (!publish) return;
    publish(
      width !== undefined && height !== undefined
        ? { width, height, label }
        : null,
    );
    return () => publish(null);
  }, [publish, width, height, label]);
}
