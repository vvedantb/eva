/** Marker read-only automations must emit before the user-visible deliverable. */
export const READ_ONLY_DELIVERABLE_MARKER = "<!-- DELIVERABLE -->";

/**
 * Extracts the user-visible deliverable from a read-only automation result.
 * Agents may reason or narrate before the marker; only content after it is stored
 * and emailed. Falls back to the trimmed full text when the marker is missing
 * (legacy runs or models that ignore the instruction).
 */
export function extractReadOnlyDeliverable(resultText: string): string {
  const trimmed = resultText.trim();
  if (!trimmed) return trimmed;

  const markerIdx = trimmed.indexOf(READ_ONLY_DELIVERABLE_MARKER);
  if (markerIdx === -1) return trimmed;

  const afterMarker = trimmed
    .slice(markerIdx + READ_ONLY_DELIVERABLE_MARKER.length)
    .trimStart();

  return stripLeadingHorizontalRule(afterMarker).trim();
}

function stripLeadingHorizontalRule(text: string): string {
  if (!text.startsWith("---")) return text;
  const afterHr = text.slice(3);
  if (!afterHr.startsWith("\n") && afterHr.length > 0) return text;
  return afterHr.trimStart();
}
