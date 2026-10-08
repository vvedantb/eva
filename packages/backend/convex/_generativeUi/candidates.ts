/**
 * Turns the agent's content blocks into composition candidates.
 *
 * A candidate is an app-owned element recipe: its props are fixed here and the
 * evaluator may only choose whether to place it and where. That is the whole
 * safety story of this feature — Jev picks a layout, it never writes copy.
 *
 * Pure, so the candidate grammar can be read and tested without the composer.
 */

import type { Experimental_CompositionCandidate } from "@json-render/core";
import type { ChatUiBlock } from "./schema";

type Candidate = Experimental_CompositionCandidate;

/** Layout recipes are reusable; one content block may be placed once. */
const LAYOUT_MAX_USES = 12;

/** Ids of block candidates, so a composed spec can be checked back against them. */
const BLOCK_ID_PREFIX = "block_";

/** True for a candidate that carries the agent's content, not layout. */
export function isBlockCandidate(candidate: Candidate): boolean {
  return candidate.id.startsWith(BLOCK_ID_PREFIX);
}

function describeBlock(block: ChatUiBlock): string {
  switch (block.kind) {
    case "heading":
      return `Heading with the exact text ${JSON.stringify(block.text)}. Use it as the title of a section.`;
    case "text":
      return `Text: a ${block.emphasis === "lead" ? "lead-in" : block.emphasis === "muted" ? "secondary" : "body"} paragraph reading ${JSON.stringify(truncate(block.text))}.`;
    case "metric":
      return `Metric: the figure ${JSON.stringify(block.label)} = ${JSON.stringify(block.value)}. Metrics belong together in one row.`;
    case "badge":
      return `Badge: the short status pill ${JSON.stringify(block.text)}.`;
    case "callout":
      return `Callout: a highlighted ${block.tone === "neutral" ? "note" : block.tone} reading ${JSON.stringify(truncate(block.text))}.`;
    case "progress":
      return `Progress bar at ${block.value}%${block.label ? ` labelled ${JSON.stringify(block.label)}` : ""}.`;
    case "checklist":
      return `Checklist of ${block.items.length} done / not-done items, starting ${JSON.stringify(truncate(block.items[0]?.text ?? ""))}.`;
    case "table":
      return `Table of ${block.rows.length} rows with the columns ${JSON.stringify(block.columns.join(", "))}. Tables are wide; give them a full-width slot.`;
    case "keyValue":
      return `Key/value list of ${block.items.length} labelled fields, starting ${JSON.stringify(block.items[0]?.label ?? "")}.`;
    case "code":
      return `Code block${block.language ? ` in ${block.language}` : ""}. Wide; give it a full-width slot.`;
    case "image":
      return `Image${block.alt ? `: ${JSON.stringify(block.alt)}` : ""}. Wide; give it a full-width slot.`;
    case "button":
      return `Button labelled ${JSON.stringify(block.label)}. Buttons belong together in one horizontal row, usually last.`;
  }
}

function truncate(text: string): string {
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

/** The element a block renders as, with every prop already decided. */
function blockElement(block: ChatUiBlock): Candidate["element"] {
  switch (block.kind) {
    case "heading":
      return { type: "Heading", props: { text: block.text, level: "h3" } };
    case "text":
      return { type: "Text", props: { text: block.text, variant: block.emphasis } };
    case "metric":
      return {
        type: "Metric",
        props: {
          label: block.label,
          value: block.value,
          delta: block.delta ?? null,
          tone: block.tone,
        },
      };
    case "badge":
      return { type: "Badge", props: { text: block.text, tone: block.tone } };
    case "callout":
      return {
        type: "Callout",
        props: { title: block.title ?? null, text: block.text, tone: block.tone },
      };
    case "progress":
      return {
        type: "Progress",
        props: { label: block.label ?? null, value: block.value },
      };
    case "checklist":
      return { type: "Checklist", props: { items: block.items } };
    case "table":
      return {
        type: "Table",
        props: { columns: block.columns, rows: block.rows },
      };
    case "keyValue":
      return { type: "KeyValue", props: { items: block.items } };
    case "code":
      return {
        type: "Code",
        props: { code: block.code, language: block.language ?? null },
      };
    case "image":
      return {
        type: "Image",
        props: { url: block.url, alt: block.alt ?? null },
      };
    case "button":
      return {
        type: "Button",
        props: { label: block.label, variant: block.variant },
        // `reply` wins when both are set: posting back into the chat is the
        // interaction this feature exists for, and a button cannot do both.
        on: block.reply
          ? { press: { action: "reply", params: { message: block.reply } } }
          : block.url
            ? { press: { action: "open_url", params: { url: block.url } } }
            : {},
      };
  }
}

function layoutCandidates(title: string | undefined): Candidate[] {
  return [
    {
      id: "layout_stack_vertical",
      description:
        "Stack: a vertical column. The usual root and the usual way to stack sections.",
      element: {
        type: "Stack",
        props: { direction: "vertical", gap: "md", align: "stretch" },
      },
      root: true,
      maxUses: LAYOUT_MAX_USES,
    },
    {
      id: "layout_stack_horizontal",
      description:
        "Stack: a horizontal row, for badges or a group of buttons side by side. Never for paragraphs, tables or code.",
      element: {
        type: "Stack",
        props: { direction: "horizontal", gap: "sm", align: "center" },
      },
      root: false,
      maxUses: LAYOUT_MAX_USES,
    },
    {
      id: "layout_grid_two",
      description: "Grid: two equal columns of peer content.",
      element: { type: "Grid", props: { columns: 2, gap: "md" } },
      root: true,
      maxUses: LAYOUT_MAX_USES,
    },
    {
      id: "layout_grid_three",
      description: "Grid: three equal columns, e.g. a row of three metrics.",
      element: { type: "Grid", props: { columns: 3, gap: "md" } },
      root: true,
      maxUses: LAYOUT_MAX_USES,
    },
    {
      id: "layout_panel",
      description: title
        ? `Panel: a bordered container titled ${JSON.stringify(title)}. Use it as the root when the whole panel is one titled group.`
        : "Panel: a bordered container that groups related content.",
      element: {
        type: "Panel",
        props: { title: title ?? null, description: null },
      },
      root: true,
      maxUses: LAYOUT_MAX_USES,
    },
    {
      id: "layout_separator",
      description:
        "Separator: a horizontal rule between two unrelated sections.",
      element: { type: "Separator", props: {} },
      root: false,
      maxUses: LAYOUT_MAX_USES,
    },
  ];
}

/**
 * Layout recipes plus one candidate per content block. Blocks keep their input
 * order in the id so a reader can line a composed spec back up with the call.
 */
export function buildChatUiCandidates(
  blocks: readonly ChatUiBlock[],
  title: string | undefined,
): Candidate[] {
  return [
    ...layoutCandidates(title),
    ...blocks.map((block, index) => ({
      id: `${BLOCK_ID_PREFIX}${index}`,
      description: describeBlock(block),
      element: blockElement(block),
      root: false,
      maxUses: 1,
    })),
  ];
}
