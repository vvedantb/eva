/** Max quote stored on a citation chip. Longer selections are rejected. */
export const ASSISTANT_CITATION_MAX_CHARS = 2_000;

export interface AssistantCitation {
  readonly id: string;
  readonly messageId: string;
  readonly text: string;
  readonly comment: string;
}

function escapeCitationText(value: string): string {
  return value.replaceAll("<", "\\u003c");
}

export function citationPreview(citation: AssistantCitation): string {
  const source = citation.comment.trim() || citation.text;
  const collapsed = source.replace(/\s+/g, " ").trim();
  return collapsed.length > 64 ? `${collapsed.slice(0, 64)}…` : collapsed;
}

export function formatCitationBlock(citation: AssistantCitation): string {
  const lines = [
    `<cited_assistant messageId="${escapeCitationText(citation.messageId)}">`,
    escapeCitationText(citation.text.trim()),
  ];
  const comment = citation.comment.trim();
  if (comment.length > 0) {
    lines.push("", `Comment: ${escapeCitationText(comment)}`);
  }
  lines.push("</cited_assistant>");
  return lines.join("\n");
}

export function appendCitationsToPrompt(
  prompt: string,
  citations: ReadonlyArray<AssistantCitation>,
): string {
  if (citations.length === 0) return prompt;
  const blocks = citations.map(formatCitationBlock).join("\n\n");
  const trimmed = prompt.trim();
  return trimmed.length > 0 ? `${trimmed}\n\n${blocks}` : blocks;
}

export function createCitation(input: {
  messageId: string;
  text: string;
  comment?: string;
}): AssistantCitation | null {
  const text = input.text.replace(/\s+/g, " ").trim();
  if (text.length === 0 || text.length > ASSISTANT_CITATION_MAX_CHARS) {
    return null;
  }
  const messageId = input.messageId.trim();
  if (messageId.length === 0) return null;
  return {
    id: `cite:${messageId}:${text.slice(0, 24)}:${Date.now()}`,
    messageId,
    text,
    comment: input.comment?.trim() ?? "",
  };
}

export const DEMO_ASSISTANT_CITATION: AssistantCitation = {
  id: "cite-demo-1",
  messageId: "msg_demo_assistant",
  text: "The billing empty state should list the last four invoices, not a generic placeholder.",
  comment: "Match the Figma empty-state copy.",
};
