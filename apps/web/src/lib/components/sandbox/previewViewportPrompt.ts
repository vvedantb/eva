import type { PublishedPreviewViewport } from "@/lib/contexts/PreviewViewportContext";

/** One line for the agent: the size of the frame the user sees the app in. */
export function formatPreviewViewportPrompt(
  viewport: PublishedPreviewViewport,
): string {
  const device = viewport.label ? ` (${viewport.label})` : "";
  return `<preview_viewport>\nThe user views the app preview in a frame of ${viewport.width}×${viewport.height} CSS px${device}.\n</preview_viewport>`;
}

/**
 * Appends the preview size to a prompt. An empty prompt stays empty: an
 * attachment-only send must not turn into a message that is only this note.
 */
export function appendPreviewViewportToPrompt(
  prompt: string,
  viewport: PublishedPreviewViewport | null,
): string {
  const trimmed = prompt.trim();
  if (!viewport || trimmed.length === 0) return prompt;
  return `${trimmed}\n\n${formatPreviewViewportPrompt(viewport)}`;
}
