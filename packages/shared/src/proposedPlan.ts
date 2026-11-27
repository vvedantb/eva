import type { Id } from "@eva/backend";

export type ProposedPlanRow = {
  _id: Id<"proposedPlans">;
  turnId?: Id<"turns">;
  messageId?: Id<"messages">;
  planMarkdown: string;
  implementedAt?: number;
  implementationSessionId?: Id<"sessions">;
  createdAt: number;
  updatedAt: number;
};

export function findLatestProposedPlan(
  proposedPlans: ReadonlyArray<ProposedPlanRow>,
): ProposedPlanRow | null {
  if (proposedPlans.length === 0) return null;
  return [...proposedPlans].sort(
    (left, right) =>
      right.updatedAt - left.updatedAt ||
      right.createdAt - left.createdAt ||
      left._id.localeCompare(right._id),
  )[0];
}

export function hasActionableProposedPlan(
  proposedPlan: Pick<ProposedPlanRow, "implementedAt"> | null,
): boolean {
  return proposedPlan !== null && proposedPlan.implementedAt === undefined;
}

export function proposedPlanForMessage(
  proposedPlans: ReadonlyArray<ProposedPlanRow>,
  messageId: string,
): ProposedPlanRow | null {
  return (
    proposedPlans.find((plan) => plan.messageId === messageId) ?? null
  );
}

export function proposedPlanTitle(planMarkdown: string): string | null {
  const heading = planMarkdown.match(/^\s{0,3}#{1,6}\s+(.+)$/m)?.[1]?.trim();
  return heading && heading.length > 0 ? heading : null;
}

function sanitizePlanFileSegment(input: string): string {
  const sanitized = input
    .toLowerCase()
    .replace(/[`'".,!?()[\]{}]+/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return sanitized.length > 0 ? sanitized : "plan";
}

export function buildProposedPlanMarkdownFilename(
  planMarkdown: string,
): string {
  const title = proposedPlanTitle(planMarkdown);
  return `${sanitizePlanFileSegment(title ?? "plan")}.md`;
}

export function normalizePlanMarkdownForExport(planMarkdown: string): string {
  return `${planMarkdown.trimEnd()}\n`;
}

export function stripDisplayedPlanMarkdown(planMarkdown: string): string {
  const lines = planMarkdown.trimEnd().split(/\r?\n/);
  const sourceLines =
    lines[0] && /^\s{0,3}#{1,6}\s+/.test(lines[0]) ? lines.slice(1) : [...lines];
  while (sourceLines[0]?.trim().length === 0) {
    sourceLines.shift();
  }
  const firstHeadingMatch = sourceLines[0]?.match(/^\s{0,3}#{1,6}\s+(.+)$/);
  if (firstHeadingMatch?.[1]?.trim().toLowerCase() === "summary") {
    sourceLines.shift();
    while (sourceLines[0]?.trim().length === 0) {
      sourceLines.shift();
    }
  }
  return sourceLines.join("\n");
}

export function buildCollapsedProposedPlanPreviewMarkdown(
  planMarkdown: string,
  options?: { maxLines?: number },
): string {
  const maxLines = options?.maxLines ?? 8;
  const lines = stripDisplayedPlanMarkdown(planMarkdown)
    .trimEnd()
    .split(/\r?\n/)
    .map((line) => line.trimEnd());
  const previewLines: string[] = [];
  let visibleLineCount = 0;
  let hasMoreContent = false;

  for (const line of lines) {
    const isVisibleLine = line.trim().length > 0;
    if (isVisibleLine && visibleLineCount >= maxLines) {
      hasMoreContent = true;
      break;
    }
    previewLines.push(line);
    if (isVisibleLine) {
      visibleLineCount += 1;
    }
  }

  while (previewLines.length > 0 && previewLines[previewLines.length - 1]?.trim().length === 0) {
    previewLines.pop();
  }

  if (previewLines.length === 0) {
    return proposedPlanTitle(planMarkdown) ?? "Plan preview unavailable.";
  }

  if (hasMoreContent) {
    previewLines.push("", "...");
  }

  return previewLines.join("\n");
}

export function buildPlanImplementationPrompt(planMarkdown: string): string {
  return `PLEASE IMPLEMENT THIS PLAN:\n${planMarkdown.trim()}`;
}

export function buildPlanImplementationThreadTitle(planMarkdown: string): string {
  const title = proposedPlanTitle(planMarkdown);
  if (!title) return "Implement plan";
  return `Implement ${title}`;
}
